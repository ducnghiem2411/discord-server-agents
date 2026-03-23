# Q&A: Xây dựng AI Agents — Thiết kế hệ thống, theo dõi và tối ưu chi phí

---

## Người dùng bảo thủ

> *"ChatGPT đang dùng tốt rồi, xây làm gì cho mệt?"*

---

**Q: ChatGPT Plus $20/tháng vs xây hệ thống này — cái nào rẻ hơn?**

Chi phí ChatGPT Plus là cố định $20/tháng nhưng chỉ dùng được thủ công, 1 người, 1 tab. Khi team nhiều người dùng song song, cần automation, cần ghi lại kết quả để tái sử dụng — thì $20 không còn đủ. Hệ thống này dùng API trực tiếp: Qwen/Gemini rẻ hơn GPT-4 nhiều lần, và mình kiểm soát được từng đồng chi phí — biết task nào tốn bao nhiêu, agent nào đắt.

---

**Q: Lợi ích thực tế cụ thể cho team là gì?**

Thay vì mỗi task phải mở ChatGPT, paste prompt, copy kết quả, paste vào bước tiếp theo — giờ chỉ cần tag bot trên Discord, hệ thống tự chạy Manager → Dev → QA, tự post kết quả từng bước vào channel, lưu lại history để tham chiếu sau. Toàn bộ không cần ai ngồi điều khiển.

---

**Q: Nếu OpenAI/Anthropic ra feature mới, hệ thống có theo kịp không?**

Có — vì dùng LangChain làm abstraction layer. Khi provider update SDK, chỉ cần `npm update`. Hơn nữa multi-provider nghĩa là không bị lock vào một vendor: OpenAI ra feature mới thì dùng OpenAI, Gemini rẻ hơn thì switch Gemini — chỉ đổi 1 dòng env `LLM_PROVIDER=gemini`.

---

**Q: Bao lâu để team master, nếu người build nghỉ việc thì sao?**

Stack gồm TypeScript + PostgreSQL + LangChain — những thứ dev nào cũng biết. Phần phức tạp nhất là `worker.ts` — 185 dòng, logic rõ ràng. Không có "magic framework" ẩn sau. Dev mới có thể đọc hiểu trong vài giờ.

---

**Q: Tại sao không dùng n8n, Zapier, Make.com?**

n8n/Zapier tốt cho automation đơn giản, không cần code. Nhưng khi cần: custom prompt theo context của từng task, truyền output của agent này vào agent tiếp theo, trace cost theo user/task, lưu history vào DB riêng — thì n8n không đủ linh hoạt. Hệ thống này kiểm soát được từng byte của prompt.

---

## Người dùng chưa biết gì

> *"Tôi không hiểu... agent là cái gì vậy?"*

---

**Q: "Agent" là gì, khác ChatGPT chỗ nào? Nó có "suy nghĩ" không?**

ChatGPT là người trả lời câu hỏi — bạn hỏi, nó trả lời, xong. Agent là người được giao vai trò cụ thể trong một dây chuyền: Manager lập kế hoạch, Dev implement, QA review. Mỗi agent nhận output của agent trước, làm phần việc của mình, rồi chuyển tiếp. Không cần người ngồi điều phối từng bước. "Suy nghĩ" theo nghĩa nó xử lý context và đưa ra kết quả có cấu trúc — nhưng không có ý thức.

---

**Q: "State machine" và "node" — giải thích bằng ví dụ thực tế?**

Hình dung như dây chuyền sản xuất: trạm 1 (Manager) nhận nguyên liệu thô (yêu cầu của bạn) → xuất ra bản kế hoạch → trạm 2 (Dev) nhận bản kế hoạch → xuất code → trạm 3 (QA) nhận code → xuất review. Mỗi "trạm" là một node, "state" là thứ được truyền giữa các trạm.

---

**Q: Memory ngắn hạn và dài hạn khác nhau chỗ nào? Hỏi lại thì agent có nhớ không?**

Memory ngắn hạn: trong một task đang chạy, Dev biết Manager đã lập kế hoạch gì — vì output của Manager được đưa vào prompt của Dev. Kết thúc task, memory này mất. Memory dài hạn: task được lưu vào PostgreSQL — bạn có thể hỏi reporter "task #5 kết quả thế nào" và nó lấy lại được.

---

**Q: "Token" là gì? Tại sao cần lo về chi phí token?**

Token là đơn vị tính giá của LLM — khoảng 1 token ≈ 1 từ tiếng Anh. Gửi 1000 từ vào model, model trả lời 500 từ = 1500 token. Mỗi 1 triệu token tốn tiền (từ vài cent đến vài dollar tùy model). Nếu không theo dõi, một task phức tạp có thể tốn nhiều hơn bạn nghĩ.

---

**Q: Có thể dùng mà không cần biết code không?**

Sau khi hệ thống được deploy, người dùng cuối chỉ cần tag bot trên Discord và viết yêu cầu bằng tiếng tự nhiên. Không cần biết code. Dev chỉ cần khi muốn thêm agent mới hoặc thay đổi workflow.

---

**Q: Sao cần nhiều tool vậy? Không thể dùng một cái thôi được không?**

Mỗi tool làm một việc tốt nhất: PostgreSQL lưu dữ liệu bền vững, LangChain giúp gọi LLM đồng nhất qua nhiều provider, Langfuse theo dõi chi phí và debug. Giống như nhà bếp cần dao, thớt, bếp riêng — không phải vì phức tạp, mà vì mỗi cái làm đúng việc của nó.

---

## Developer khó tính

> *"Nghe hay đấy, nhưng tôi cần biết chi tiết implementation..."*

---

**Q: LangGraph state machine — state serialize và persist thế nào? Distributed execution được không?**

State được serialize thành JSON và lưu vào cột `data` trong bảng `jobs` trên PostgreSQL. Mỗi lần agent hoàn thành, job tiếp theo được `enqueue` với `outputs` đã cập nhật — không có shared in-memory state. Hiện tại là single-process polling (`setInterval` mỗi 1000ms), chưa support distributed. Nếu cần scale horizontal, có thể deploy nhiều worker process — `FOR UPDATE SKIP LOCKED` đã có sẵn trong `claimNext()` để tránh double-claim.

---

**Q: Multi-LLM abstraction layer trông như thế nào? Swap seamlessly thế nào giữa các provider?**

Interface `LLMProvider` chỉ có một method: `generate(prompt, systemPrompt, options)`. Tất cả provider (OpenAI, Anthropic, Qwen, Gemini) implement interface này và đều dùng LangChain `.invoke(messages, runConfig)` bên dưới — format message được LangChain normalize. Switch provider chỉ cần đổi `LLM_PROVIDER` env. Tuy nhiên hiện tại là singleton cố định khi start — chưa support switch per-task hay per-agent.

---

**Q: Queue worker xử lý concurrent task thế nào? Có race condition không?**

Được xử lý bằng PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`. Query `claimNext` atomically update status thành `'running'` trong cùng một statement — nếu nhiều worker cùng poll, mỗi worker chỉ lấy được job chưa bị lock. Không có application-level locking, dựa hoàn toàn vào DB transaction — đây là cách tiêu chuẩn cho queue pattern với PostgreSQL.

---

**Q: "Semantic cache dùng vector search" — threshold set bao nhiêu? Đo và tune thế nào?**

Thật ra hiện tại **chưa implement semantic cache**. Đây là chiến lược được đề cập trong slide như roadmap tối ưu chi phí, nhưng chưa có trong code. Khi implement, threshold similarity (thường cosine distance < 0.1–0.15) cần tune dựa trên dataset thực tế và đo cache hit rate vs accuracy.

---

**Q: Langfuse tracing overhead bao nhiêu ms? Nếu Langfuse down thì agent có bị block không?**

`createLangfuseHandler` trả về `undefined` nếu keys không được config — khi đó không có callback nào. Khi Langfuse hoạt động, handler được truyền qua LangChain callbacks — LangChain gọi callback async, không block main execution. Nếu Langfuse server down hoàn toàn, `CallbackHandler` fail silently. Tuy nhiên chưa có explicit timeout config cho Langfuse client — nếu Langfuse slow thay vì down hẳn, có thể add latency.

---

**Q: Pgvector — embedding dimension bao nhiêu? Index loại gì? Query latency khi data lớn?**

Phần vector/embedding hiện **chưa được implement** trong codebase — chỉ có PostgreSQL thuần cho jobs và tasks. pgvector là ý định cho memory dài hạn/semantic search nhưng chưa có migration hay code tương ứng. Khi implement: dimension phụ thuộc model embedding (thường 1536 cho OpenAI, 768 cho smaller models), nên dùng HNSW index cho query latency tốt hơn IVFFlat ở scale lớn.

---

**Q: Retry logic — exponential backoff không? Fail ở giữa pipeline thì retry từ đầu hay từ node lỗi?**

Hiện tại khi job fail: `failJob()` mark status `'failed'`, `failTask()` mark task `'failed'`, Discord được notify. **Không có auto-retry**. Nếu fail ở bước Dev (bước 3), không có checkpoint resume — phải tạo task mới từ đầu. Đây là limitation rõ ràng: để có proper retry từ checkpoint cần persist state per-step và thêm retry queue logic với exponential backoff.

---

**Q: System prompt version — lưu ở đâu, deploy thế nào? Rollback được không nếu prompt mới làm quality giảm?**

System prompt hiện **hardcode trực tiếp trong mỗi agent file** (e.g., constant `SYSTEM_PROMPT` trong `manager.ts`). Không có versioning, không có A/B test, rollback chỉ qua git revert + redeploy. Đây là technical debt rõ ràng — nếu muốn kiểm soát prompt không cần redeploy, cần migrate sang Langfuse Prompt Management hoặc DB-backed prompt store.

---

## Tóm tắt: Hiện trạng vs Roadmap

| Tính năng | Hiện trạng | Roadmap |
|-----------|-----------|---------|
| Queue + pipeline (Manager→Dev→QA) | ✅ Có | — |
| PostgreSQL persistence | ✅ Có | — |
| Multi-LLM (OpenAI/Anthropic/Qwen/Gemini) | ✅ Có | — |
| Langfuse tracing per-task | ✅ Có | — |
| `FOR UPDATE SKIP LOCKED` concurrency | ✅ Có | — |
| Per-agent model tiering | ❌ Chưa | Roadmap |
| Semantic cache | ❌ Chưa | Roadmap |
| pgvector / memory dài hạn | ❌ Chưa | Roadmap |
| Auto-retry + checkpoint resume | ❌ Chưa | Roadmap |
| Prompt versioning / A/B test | ❌ Chưa | Roadmap |
| Distributed worker | ❌ Chưa | Roadmap |
