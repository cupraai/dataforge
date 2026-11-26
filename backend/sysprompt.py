"""Load and validate the Markdown instructions used by Auto-caption."""

from pathlib import Path

from markdown_it import MarkdownIt

from constants import SYSPROMPT_FILENAME
from folder_instructions import find_instruction_file, read_instruction_file, save_instruction_file
from schemas import SyspromptPlacement


def validate_sysprompt(text: str) -> None:
    """Require a non-empty Markdown document with a level one ATX heading first."""
    text = text.strip()
    if not text:
        raise ValueError("The system prompt cannot be empty.")
    tokens = MarkdownIt("commonmark").parse(text)
    first = tokens[0] if tokens else None
    if (
        not text.startswith(("# ", "#\t"))
        or first is None
        or first.type != "heading_open"
        or first.markup != "#"
        or not tokens[1].content.strip()
    ):
        raise ValueError(
            "The system prompt must start with a non-empty # heading, such as # Caption instructions."
        )


def load_sysprompt(folder: Path) -> str | None:
    """The nearest valid prompt; an invalid file still blocks inheritance."""
    path = find_instruction_file(folder, SYSPROMPT_FILENAME)
    if path is None:
        return None
    try:
        text = read_instruction_file(path).strip()
        validate_sysprompt(text)
    except (OSError, ValueError):
        return None
    return text


def load_placed_sysprompt(folder: Path, placement: SyspromptPlacement) -> str | None:
    """None when the job leaves the prompt out or the folder has no valid one."""
    return None if placement == "off" else load_sysprompt(folder)


def place_sysprompt(
    section: str | None, sysprompt: str | None, placement: SyspromptPlacement
) -> list[str]:
    """The user's own prompt section, with the folder's system prompt on the chosen side."""
    sections = [section] if section else []
    if sysprompt is None or placement == "off":
        return sections
    return [sysprompt, *sections] if placement == "before" else [*sections, sysprompt]


def save_sysprompt(folder: Path, text: str) -> None:
    """Validate before writing; blank text removes the local override."""
    if text.strip():
        validate_sysprompt(text)
    save_instruction_file(folder, SYSPROMPT_FILENAME, text)
