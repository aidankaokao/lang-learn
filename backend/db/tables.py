"""資料表定義（SQLAlchemy Core，見 database.md §4）。

型別一律用可攜通用型別，換 PostgreSQL 不必改。
表名欄名一律小寫蛇底線。

分組：
  帳號        users
  LLM 設定    llm_providers
  影片文字稿  videos / transcript_segments
  聽力例句    clips / clip_practices
  片語        phrases / phrase_practices
  問答        chat_messages
"""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)

metadata = MetaData()


# ── 帳號 ────────────────────────────────────────────────
users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String(64), nullable=False, unique=True),
    Column("password_hash", String(255), nullable=False),
    Column("role", String(16), nullable=False, server_default="user"),  # admin | user
    Column("is_active", Boolean, nullable=False, server_default="1"),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


# ── LLM provider（每個使用者各自註冊，見 llm-integration.md §5）──
llm_providers = Table(
    "llm_providers",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String(100), nullable=False),  # 顯示名稱
    Column("provider", String(16), nullable=False),  # openai | ollama
    Column("base_url", String(255), nullable=False),
    Column("model", String(120), nullable=False),
    Column("api_key_enc", Text, nullable=True),  # Fernet 加密後的字串，不回傳明文
    Column("temperature", Float, nullable=False, server_default="0.0"),
    Column("is_active", Boolean, nullable=False, server_default="0"),  # 該使用者目前選用
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


# ── 影片與文字稿 ────────────────────────────────────────
videos = Table(
    "videos",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("youtube_id", String(32), nullable=False),
    Column("title", String(500), nullable=True),
    Column("channel", String(255), nullable=True),
    Column("duration_sec", Integer, nullable=True),
    Column("thumbnail_url", String(500), nullable=True),
    # pending | ready | failed
    Column("transcript_status", String(16), nullable=False, server_default="pending"),
    Column("transcript_source", String(16), nullable=True),  # caption | whisper
    Column("error_message", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
    UniqueConstraint("user_id", "youtube_id", name="uq_videos_user_youtube"),
)

transcript_segments = Table(
    "transcript_segments",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("video_id", Integer, ForeignKey("videos.id"), nullable=False),
    Column("idx", Integer, nullable=False),  # 句序，從 0 起
    Column("start_ms", Integer, nullable=False),
    Column("end_ms", Integer, nullable=False),
    Column("text", Text, nullable=False),
)


# ── 聽力例句（AB 擷取，與 phrases 同為 practice item）──
clips = Table(
    "clips",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("video_id", Integer, ForeignKey("videos.id"), nullable=False),
    Column("start_ms", Integer, nullable=False),
    Column("end_ms", Integer, nullable=False),
    Column("label", String(200), nullable=True),
    Column("text", Text, nullable=True),  # 擷取當下的 transcript 快照
    Column("translation", Text, nullable=True),  # 中文對照（建立時背景產生）
    Column("note", Text, nullable=True),
    # ── SRS（間隔重複），與 phrases 共用同一組欄位 ──
    Column("ease", Float, nullable=False, server_default="2.5"),
    Column("interval_days", Integer, nullable=False, server_default="0"),
    Column("due_at", DateTime(timezone=True), nullable=True),
    Column("review_count", Integer, nullable=False, server_default="0"),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)

clip_practices = Table(
    "clip_practices",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("clip_id", Integer, ForeignKey("clips.id"), nullable=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("mode", String(16), nullable=False),  # dictation | shadowing
    Column("input_text", Text, nullable=True),  # 聽寫輸入
    Column("accuracy", Float, nullable=True),  # difflib 算出的正確率 0~1
    Column("diff_json", JSON, nullable=True),  # word-level diff 結果
    Column("feedback", Text, nullable=True),  # LLM 解釋「為什麼聽錯」
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


# ── 片語 ────────────────────────────────────────────────
phrases = Table(
    "phrases",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("video_id", Integer, ForeignKey("videos.id"), nullable=True),
    Column("segment_id", Integer, ForeignKey("transcript_segments.id"), nullable=True),
    Column("text", String(300), nullable=False),
    Column("meaning", Text, nullable=True),  # 中文語意
    Column("explanation", Text, nullable=True),  # 用法解析
    Column("examples_json", JSON, nullable=True),  # 例句列表
    Column("paraphrases_json", JSON, nullable=True),  # 換句話說
    Column("difficulty", String(16), nullable=True),  # easy | medium | hard
    # ── SRS ──
    Column("ease", Float, nullable=False, server_default="2.5"),
    Column("interval_days", Integer, nullable=False, server_default="0"),
    Column("due_at", DateTime(timezone=True), nullable=True),
    Column("review_count", Integer, nullable=False, server_default="0"),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)

phrase_practices = Table(
    "phrase_practices",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("phrase_id", Integer, ForeignKey("phrases.id"), nullable=False),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("user_sentence", Text, nullable=False),  # 造樣造句
    Column("is_correct", Boolean, nullable=True),
    Column("correction", Text, nullable=True),  # 批改後的句子
    Column("feedback", Text, nullable=True),  # 錯在哪、為什麼
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


# ── 問答（tutor agent 對話紀錄）──
chat_messages = Table(
    "chat_messages",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("video_id", Integer, ForeignKey("videos.id"), nullable=True),
    Column("thread_id", String(64), nullable=False),  # LangGraph checkpoint thread
    Column("role", String(16), nullable=False),  # user | assistant
    Column("content", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)
