from dataclasses import asdict

from fastapi import APIRouter, HTTPException

import tagger
from about import describe_installation
from openai_settings import get_openai_model
from schemas import (
    AboutResponse,
    SystemSpecsResponse,
    TaggingRetagResponse,
    TaggingStatusResponse,
    TagVocabularyResponse,
    TagVocabularyUpdate,
    VisionLlmInfoResponse,
)
from system_specs import get_system_specs
from tagging_worker import retag_everything, tagging_status

router = APIRouter()


@router.get("/system/specs", response_model=SystemSpecsResponse)
def read_system_specs() -> SystemSpecsResponse:
    return SystemSpecsResponse.model_validate(asdict(get_system_specs()))


@router.get("/system/vision-llm", response_model=VisionLlmInfoResponse)
def read_vision_llm_info() -> VisionLlmInfoResponse:
    return VisionLlmInfoResponse(model=get_openai_model())


@router.get("/system/tagging", response_model=TaggingStatusResponse)
def read_tagging_status() -> TaggingStatusResponse:
    return tagging_status()


@router.post("/system/tagging/retag", response_model=TaggingRetagResponse)
def request_retag() -> TaggingRetagResponse:
    """Queues every tagged file; a new vocabulary on its own only reaches files tagged later."""
    return TaggingRetagResponse(queued=retag_everything())


def _describe_vocabulary() -> TagVocabularyResponse:
    default_count, added_count = tagger.vocabulary_counts()
    return TagVocabularyResponse(
        text=tagger.read_personal_vocabulary_text(),
        default_count=default_count,
        added_count=added_count,
    )


@router.get("/system/tagging/vocabulary", response_model=TagVocabularyResponse)
def read_tag_vocabulary() -> TagVocabularyResponse:
    return _describe_vocabulary()


@router.put("/system/tagging/vocabulary", response_model=TagVocabularyResponse)
def write_tag_vocabulary(body: TagVocabularyUpdate) -> TagVocabularyResponse:
    """Applies to files tagged from now on; Re-tag everything brings the rest up to it."""
    try:
        tagger.write_personal_vocabulary_text(body.text)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _describe_vocabulary()


@router.get("/system/about", response_model=AboutResponse)
def read_about() -> AboutResponse:
    return describe_installation()
