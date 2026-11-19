from __future__ import annotations

import json

from pydantic import BaseModel, Field, ValidationError

from db import get_preference, set_preference


def validated_or_default[T: BaseModel](model: type[T], data: dict) -> T:
    """``model`` must build with no arguments."""
    try:
        return model.model_validate(data)
    except ValidationError:
        return model()


def _stored_mapping(key: str) -> dict | None:
    raw = get_preference(key)
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    return data if isinstance(data, dict) else None


class JsonPreference[T: BaseModel]:
    """``model`` must build with no arguments."""

    def __init__(self, key: str, model: type[T]) -> None:
        self.key = key
        self._model = model

    def get(self) -> T:
        data = _stored_mapping(self.key)
        return self._model() if data is None else validated_or_default(self._model, data)

    def save(self, settings: T) -> T:
        set_preference(self.key, settings.model_dump_json())
        return settings

    def update(self, **changes: object) -> T:
        applied = {name: value for name, value in changes.items() if value is not None}
        return self.save(self.get().model_copy(update=applied))


class FolderScopedEnvelope(BaseModel):
    """A typed dict would fail on one corrupt folder."""

    latest: dict[str, object] | None = None
    by_folder: dict[str, dict[str, object]] = Field(default_factory=dict)


class FolderScopedPreference[T: BaseModel]:
    """``folder_key`` must already be canonical."""

    def __init__(self, key: str, model: type[T]) -> None:
        self.key = key
        self._model = model
        self._envelope: JsonPreference[FolderScopedEnvelope] = JsonPreference(
            key, FolderScopedEnvelope
        )

    def get(self, folder_key: str) -> T:
        envelope = self._envelope.get()
        payload = envelope.by_folder.get(folder_key)
        if payload is None:
            payload = envelope.latest
        return self._model() if payload is None else validated_or_default(self._model, payload)

    def folder_keys(self) -> set[str]:
        return set(self._envelope.get().by_folder)

    def forget_folders(self) -> None:
        """Keeps ``latest`` for folders opened later."""
        self._envelope.update(by_folder={})

    def latest(self) -> T:
        payload = self._envelope.get().latest
        return self._model() if payload is None else validated_or_default(self._model, payload)

    def save(self, folder_key: str, settings: T) -> T:
        payload = settings.model_dump(mode="json")
        envelope = self._envelope.get()
        self._envelope.save(
            envelope.model_copy(
                update={
                    "latest": payload,
                    "by_folder": {**envelope.by_folder, folder_key: payload},
                }
            )
        )
        return settings
