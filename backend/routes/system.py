from dataclasses import asdict

from fastapi import APIRouter, HTTPException

import tagger
from about import describe_installation
from automation.llm import model_client
from automation.served_model import read_served_model
from openai_settings import get_openai_base_url, get_openai_model
from schemas import (
    AboutResponse,
    SystemPerformanceResponse,
    SystemSpecsResponse,
    TaggingRetagResponse,
    TaggingStatusResponse,
    TagVocabularyResponse,
    TagVocabularyUpdate,
    VisionLlmInfoResponse,
)
from system_performance import get_system_performance
from system_specs import get_system_specs
from tagging_worker import retag_everything, tagging_status

router = APIRouter()


@router.get("/system/specs", response_model=SystemSpecsResponse)
def read_system_specs() -> SystemSpecsResponse:
    return SystemSpecsResponse.model_validate(asdict(get_system_specs()))


@router.get("/system/performance", response_model=SystemPerformanceResponse)
def read_system_performance() -> SystemPerformanceResponse:
    return SystemPerformanceResponse.model_validate(asdict(get_system_performance()))


@router.get("/system/vision-llm", response_model=VisionLlmInfoResponse)
def read_vision_llm_info() -> VisionLlmInfoResponse:
    configured = get_openai_model()
    with model_client() as client:
        served = read_served_model(client, configured)
    return VisionLlmInfoResponse(
        model=configured,
        base_url=get_openai_base_url(),
        served_model=served.model,
        reasoning_efforts=None if served.efforts is None else list(served.efforts),
        detail=served.problem,
        reachable=served.reachable,
    )


@router.get("/system/tagging", response_model=TaggingStatusResponse)
def read_tagging_status() -> TaggingStatusResponse:
    return tagging_status()


@router.post("/system/tagging/retag", response_model=TaggingRetagResponse)
def request_retag() -> TaggingRetagResponse:
    """A new vocabulary alone only reaches files tagged later."""
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
    """Re-tag everything brings the rest up to it."""
    try:
        tagger.write_personal_vocabulary_text(body.text)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _describe_vocabulary()


@router.get("/system/about", response_model=AboutResponse)
def read_about() -> AboutResponse:
    return describe_installation()
