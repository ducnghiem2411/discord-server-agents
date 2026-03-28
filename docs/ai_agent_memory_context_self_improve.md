# Memory, Context & Self-Improve trong hệ thống AI Agent

---

## 1 — Vấn đề

Bạn vừa giải thích xong cả buổi sáng cho AI, rồi chiều hỏi lại — nó không nhớ gì cả.

Agent tự động sửa code, chạy lại, fail mãi một lỗi — nhưng không bao giờ rút kinh nghiệm.

Đây không phải vấn đề về **trí thông minh** của model — mà là vấn đề về **kiến trúc hệ thống**.

### Vấn đề thực tế trong AI agent

| Vấn đề                      | Hệ quả                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Stateless by default        | Mỗi request đến LLM là độc lập, không có state giữa các lần gọi        |
| Context window giới hạn     | Conversation dài bị cắt, thông tin đầu session bị "quên"               |
| Không học từ lỗi            | Agent lặp lại sai lầm trong các task tương tự                          |
| Chi phí tăng theo thời gian | Nhồi toàn bộ history vào context → token tăng, latency tăng, cost tăng |

---

## 2 — Khái niệm

### Memory

Là khả năng lưu trữ và truy xuất thông tin vượt qua ranh giới của một session hay context window.

**Phân loại**:

- Short-term / Working memory: là bộ nhớ lưu trữ tạm thời, dung lượng nhỏ.
- Một số loại & cách triển khai:
- in-context window / sliding / truncation: nhét toàn bộ hoặc 1 phần lịch sử hội thoại gần nhất vào prompt
- summarization / token budget / compression: nén nội dung cũ bằng llm trước khi đưa vào context

- Long-term: là bộ nhớ lưu trữ lâu dài, dung lượng lớn
- Một số loại
  Semantic: Kiến thức tổng quát về thế giới, facts, dữ liệu cụ thể từ tài liệu nội bộ
  Episodic: Lịch sử, sự kiện
  Procedural: Cách làm, kỹ năng | Tool defs, System prompt, Workflows
  Prospective: Việc cần làm | Task queue, Scheduler
  => Key-Value store, Knowledge graph, Embed text Vector DB

### Context window

Context window là giới hạn tối đa số token mà model có thể nhìn thấy (input) và xử lý (output) cùng một lúc.
Trong thực tế, hầu hết các model hiện nay đều có giới hạn max output token để đảm bảo request luôn kết thúc cũng như đảm bảo chất lượng cho output, tránh bị loãng
Ví dụ thực tế
Claude Sonnet 4.6 — Context 200K, Max Output 64K
Trường hợp 1: Input:  180,000 tok  →  Output tối đa: 20,000 tok (bị giới hạn bởi context)
Trường hợp 2: Input:  10,000 tok   →  Output tối đa: 64,000 tok (bị giới hạn bởi max output)


### Self-improve

Cơ chế agent điều chỉnh hành vi dựa trên kết quả và feedback

Client-side (prompt engineering thuần túy)

Memory & RAG — lấy thông tin liên quan, nhét vào system prompt hoặc user prompt trước khi gọi llm
Tool results — chạy code/search bên ngoài, đưa kết quả vào prompt.
Reflection loop — gọi model nhiều lần, output lần trước trở thành input lần sau => model tự đánh giá và cải thiện dần kết quả cuối cùng.
Prompt optimization — tự động viết lại prompt dựa trên số liệu, đánh giá từ các mẫu có sẵn. Một số phương pháp/quy trình giải quyết vấn đề này (Fewshot, Bayesian search, Text Gradient (TextGrad), APE, DPYs)
Multi-agent — nhiều lần gọi llm với vai trò (role) khác nhau, sau 1 chuỗi phản biện, bổ sung => tạo ra kết quả. 
hoặc chạy song song nhiều agent để tìm kết quả tốt nhất

---

## 04 — Why

### Tại sao "chat history đơn giản" không đủ?

```
Naive approach  →  nhét toàn bộ history vào prompt  →  O(n) tokens mỗi turn

Không có memory  →  agent không biết user preference  →  trải nghiệm rời rạc

Không có self-improve  →  lặp lại lỗi đã biết  →  agent không "trưởng thành"
```

Hệ thống agent thực tế cần **quản lý bộ nhớ có chủ đích** — biết cái gì cần nhớ, cái gì có thể bỏ, và khi nào cần học lại.

---

## 05 — How

### Kiến trúc Memory trong Agent

**Tầng 1 — In-context memory (short-term)**

- Conversation buffer, sliding window, summarization
- Tồn tại trong một session, bị xóa khi kết thúc

**Tầng 2 — External memory (long-term)**

- Vector DB (pgvector): lưu embedding của các đoạn hội thoại, facts, preference
- Key-value store: user profile, session state
- Episodic log: lịch sử hành động của agent

**Tầng 3 — Self-improve loop**

- Reflection node → đánh giá kết quả hành động vừa thực hiện
- Memory write → ghi insight vào external store
- Retrieval → lần sau lấy lại và áp dụng

### Flow tổng thể (LangGraph)

```
User input
    │
    ▼
[Retrieve memory]  ←── pgvector similarity search
    │
    ▼
[Compose context]  ←── memory + system prompt + current input
    │
    ▼
[LLM call]         ←── DeepSeek / Gemini
    │
    ▼
[Action / Response]
    │
    ▼
[Reflect & Write]  ←── nếu có feedback hoặc kết quả đánh giá được
    │
    └──────────────────► pgvector (update memory)
```

> LangGraph: mỗi node là một bước — có thể loop, branch, hoặc trigger memory write có điều kiện.

---

## 06 — Demo / Use case

### Khung demo — Discord chatbot

**Stack:** Node.js · LangGraph · PostgreSQL + pgvector · Discord Bot · Langfuse · DeepSeek / Gemini

**Kịch bản:**

```
User (Discord)    →  "Review PR #42 cho tôi và nhớ style preference của tôi"

Retrieve node     →  query pgvector → tìm memory:
                     "user thích comment ngắn, ghét nitpick"

LangGraph         →  inject memory vào context
                  →  gọi LLM (DeepSeek/Gemini)
                  →  trả về review theo đúng style

Reflect node      →  user react 👍
                  →  Langfuse log trace
                  →  ghi memory: "PR review style: ✓ concise confirmed"

Next session      →  agent tự áp dụng style đã học, không cần nhắc lại
```

**Demo point:** So sánh session 1 (chưa có memory) vs session 3 (đã học preference) — Langfuse trace sẽ visualize rõ sự khác biệt trong prompt được inject.

---

## 07 — Trade-offs

### Nên dùng khi

- Agent tương tác nhiều lần với cùng một user
- Task lặp lại, cần học preference theo thời gian
- Workflow dài, cần giữ state giữa các bước
- Muốn giảm token cost dài hạn (tóm tắt thay vì nhồi raw history)

### Cẩn thận khi

- Memory cũ có thể sai hoặc outdated → cần TTL hoặc invalidation strategy
- Self-improve có thể học hành vi sai nếu feedback có noise → cần confidence threshold
- Retrieval thêm latency (~50–200ms tùy DB và embedding model)
- Privacy: user data trong vector DB cần quản lý và phân quyền rõ ràng

---

## 08 — Summary

1. **Memory không phải "chat history"** — đó là hệ thống lưu trữ có chủ đích với retrieval thông minh.
2. **Context = cái agent đang "nghĩ"** — quản lý tốt context = agent thông minh hơn với ít token hơn.
3. **Self-improve không cần retrain** — reflection + memory write là đủ để agent "trưởng thành" theo thời gian.
4. **Stack thực tế:** LangGraph (flow) + pgvector (lưu trữ) + Langfuse (observe) là nền tảng đủ mạnh cho production.

---

## 09 — Q&A & References

### Câu hỏi gợi ý thảo luận

- Khi nào bạn nên dùng vector search thay vì full-text search cho memory retrieval?
- Làm thế nào để tránh memory poisoning trong self-improve loop?
- Observability với Langfuse giúp gì trong việc debug memory issues?

### Tài nguyên

| Loại  | Tài nguyên                                                                                    |
| ----- | --------------------------------------------------------------------------------------------- |
| Docs  | LangGraph — Memory & Persistence (`langchain-ai.github.io/langgraph`)                         |
| Paper | Reflexion: Language Agents with Verbal Reinforcement Learning — Shinn et al. (2023)           |
| Paper | MemGPT: Towards LLMs as Operating Systems — Packer et al. (2023)                              |
| Docs  | Langfuse — LLM Observability & Tracing (`langfuse.com/docs`)                                  |
| Docs  | pgvector — Open-source vector similarity search for Postgres (`github.com/pgvector/pgvector`) |
| Blog  | Cognitive Architectures for Language Agents (CoALA) — Sumers et al. (2023)                    |
