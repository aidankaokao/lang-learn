export type TranscriptStatus = "pending" | "ready";

export type Video = {
  id: number;
  youtube_id: string;
  title: string | null;
  channel: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  /** pending = 還沒貼字幕；ready = 可以開始學習 */
  transcript_status: TranscriptStatus;
  created_at: string;
};

export type Segment = {
  id: number;
  video_id: number;
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type Phrase = {
  id: number;
  video_id: number | null;
  segment_id: number | null;
  text: string;
  meaning: string | null;
  explanation: string | null;
  examples_json: string[] | null;
  paraphrases_json: string[] | null;
  difficulty: string | null;
  review_count: number;
  due_at: string | null;
  created_at: string;
  /** 只有列表 API 會帶 */
  video_title?: string | null;
};

/** 萃取出來但還沒收藏的候選片語 */
export type PhraseCandidate = {
  text: string;
  meaning: string;
  difficulty: string;
};

export type PhrasePractice = {
  id: number;
  phrase_id: number;
  user_sentence: string;
  is_correct: boolean | null;
  correction: string | null;
  feedback: string | null;
  created_at?: string;
};

export type DiffOp = {
  op: "equal" | "wrong" | "missing" | "extra";
  expected: string[];
  actual: string[];
};

export type ClipPractice = {
  id: number;
  clip_id: number;
  mode: "dictation" | "shadowing";
  input_text: string | null;
  accuracy: number | null;
  diff_json: DiffOp[] | null;
  feedback: string | null;
  /** 只有剛批改完的回應會帶 */
  expected_text?: string;
  created_at?: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type ReviewQueue = {
  phrases: Phrase[];
  clips: Clip[];
  total: number;
};

export type Clip = {
  id: number;
  video_id: number;
  start_ms: number;
  end_ms: number;
  label: string | null;
  text: string | null;
  translation: string | null;
  note: string | null;
  review_count: number;
  due_at: string | null;
  created_at: string;
  /** 只有列表 API 會帶 */
  youtube_id?: string;
  video_title?: string | null;
};
