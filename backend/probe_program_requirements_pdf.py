"""Extract an auditable JSON snapshot from a program-requirements PDF."""

import argparse
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import pdfplumber


COURSE_PATTERN = re.compile(r"\b([A-Z]{2,5})\s*[- ]?\s*(\d{3,4}[A-Z]?)\b")
CREDITS_PATTERN = re.compile(r"(?:\(|\b)(\d(?:\.\d+)?)\s*(?:credits?|cr\.?)(?:\)|\b)", re.IGNORECASE)


def is_heading(line: str) -> bool:
    letters = [character for character in line if character.isalpha()]
    return (
        3 <= len(line) <= 120
        and len(letters) >= 4
        and line.upper() == line
        and COURSE_PATTERN.search(line) is None
    )


def repair_pdf_text(value: str) -> str:
    if "â" not in value and "Â" not in value:
        return value
    try:
        return value.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def is_program_heading(lines: list[str], index: int) -> bool:
    if not is_heading(lines[index]):
        return False
    following = " ".join(lines[index + 1:index + 3]).lower()
    return "chairperson" in following or "director" in following


def extract_snapshot(source_path: Path) -> dict[str, object]:
    pages: list[dict[str, object]] = []
    course_occurrences: list[dict[str, object]] = []
    warnings: list[str] = []
    current_program: str | None = None
    current_section: str | None = None

    with pdfplumber.open(source_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            text = repair_pdf_text(page.extract_text(layout=True) or "")
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if not text.strip():
                warnings.append(f"Page {page_number} contains no extractable text.")

            pages.append({"page": page_number, "text": text})
            for line_index, line in enumerate(lines):
                line_number = line_index + 1
                if is_program_heading(lines, line_index):
                    current_program = line
                if is_heading(line):
                    current_section = line

                matches = list(COURSE_PATTERN.finditer(line))
                for match in matches:
                    credits_match = CREDITS_PATTERN.search(line)
                    course_occurrences.append(
                        {
                            "course_code": f"{match.group(1)} {match.group(2)}",
                            "subject": match.group(1),
                            "course_number": match.group(2),
                            "program_heading": current_program,
                            "requirement_section": current_section,
                            "credits": float(credits_match.group(1)) if credits_match else None,
                            "source_page": page_number,
                            "source_line": line_number,
                            "source_text": line,
                        }
                    )

    if not course_occurrences:
        warnings.append("No course-code patterns were found; inspect the page text before importing.")

    return {
        "schema_version": 1,
        "source": {
            "filename": source_path.name,
            "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
            "page_count": len(pages),
        },
        "extracted_at": datetime.now(UTC).isoformat(),
        "course_occurrence_count": len(course_occurrences),
        "course_occurrences": course_occurrences,
        "pages": pages,
        "warnings": warnings,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        type=Path,
        default=Path("temp/programs-2023-1-.pdf"),
        help="PDF to extract (default: temp/programs-2023-1-.pdf)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/program-requirements/programs_2023_extracted.json"),
        help="Destination JSON snapshot",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.source.is_file():
        raise SystemExit(f"PDF not found: {args.source}")

    snapshot = extract_snapshot(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved {snapshot['course_occurrence_count']} course occurrences to {args.output}")
    for warning in snapshot["warnings"]:
        print(f"Warning: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
