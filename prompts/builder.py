from prompts.core import CORE_PROMPT
from prompts.personas import PERSONAS
from prompts.scenes import SCENES


DEFAULT_SCENE = "home_beer"
DEFAULT_PERSONA = "close_friend"


def build_system_prompt(
    scene: str = DEFAULT_SCENE,
    persona: str = DEFAULT_PERSONA,
) -> str:
    if scene not in SCENES:
        raise ValueError(f"지원하지 않는 장면입니다: {scene}")

    if persona not in PERSONAS:
        raise ValueError(f"지원하지 않는 캐릭터입니다: {persona}")

    return "\n\n".join(
        [
            CORE_PROMPT,
            SCENES[scene],
            PERSONAS[persona],
        ]
    )