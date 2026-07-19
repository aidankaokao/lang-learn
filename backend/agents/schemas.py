"""LLM 結構化輸出的 schema。

一律走 `llm.with_structured_output(Model)`，不自己 parse JSON 字串 ——
模型回傳不合格式時 LangChain 會處理重試，比手動 json.loads 穩。
"""

from pydantic import BaseModel, Field


class PhraseCandidate(BaseModel):
    """從文字稿挑出來的候選片語。"""

    text: str = Field(description="片語本身，保持影片中的原始形式，不要改寫")
    meaning: str = Field(description="繁體中文語意，一句話")
    difficulty: str = Field(description="難度：easy / medium / hard")


class PhraseCandidates(BaseModel):
    items: list[PhraseCandidate] = Field(default_factory=list)


class PhraseExplanation(BaseModel):
    """片語的完整解析。"""

    meaning: str = Field(description="繁體中文語意")
    explanation: str = Field(description="用法解析：語氣、使用情境、常見搭配、注意事項")
    examples: list[str] = Field(default_factory=list, description="3 個英文例句")
    paraphrases: list[str] = Field(default_factory=list, description="3 個英文的換句話說")


class SentenceGroup(BaseModel):
    """把數個文字稿段落合併成一個完整句子。"""

    start_index: int = Field(description="這句涵蓋的第一個段落編號")
    end_index: int = Field(description="這句涵蓋的最後一個段落編號（含）")
    text: str = Field(description="補上標點與大小寫後的完整句子")


class SentenceGroups(BaseModel):
    groups: list[SentenceGroup] = Field(default_factory=list)


class SentenceGrading(BaseModel):
    """造樣造句的批改結果。"""

    is_correct: bool = Field(description="句子是否正確且自然地使用了該片語")
    correction: str = Field(description="修正後的句子；本來就正確就回原句")
    feedback: str = Field(description="繁體中文說明：錯在哪、為什麼、怎麼改更自然")
