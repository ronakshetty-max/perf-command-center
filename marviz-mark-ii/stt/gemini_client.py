from __future__ import annotations

from google import genai
from google.genai import types

from config import Settings


class GeminiTranscriber:
    """Speech-to-text via Gemini's native audio understanding, in place of
    Whisper. Uses GEMINI_API_KEY (an AI Studio key), separate from
    GOOGLE_API_KEY which is not valid for the Gemini API."""

    def __init__(self, settings: Settings):
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_transcription_model

    def transcribe(self, audio_bytes: bytes, filename: str = "command.webm") -> str:
        mime_type = "audio/webm" if filename.endswith(".webm") else "audio/wav"
        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                "Transcribe the speech in this audio exactly as spoken. "
                "Output only the transcription text, with no preamble, "
                "labels, or commentary.",
            ],
        )
        return (response.text or "").strip()
