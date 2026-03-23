# Xây dựng AI Agents: Thiết kế hệ thống, theo dõi và tối ưu chi phí

---

## 1. Problem — Vấn đề khi sử dụng các công cụ AI

- **Quản lí state:** LLM, Tool không nhớ gì giữa các lần gọi hoặc state giữa các lần gọi có thể bị lẫn lộn, có thể kết quả bước trước cho bước sau, người dùng phải tự quản lý.
- **Control flow:** Khó có thể phân nhánh, loop, retry hay dừng có điều kiện dựa trên nhiều điều kiện như output model llm, state từ bên ngoài, data trong hệ thống.
- **Kết hợp nhiều agent:** Nếu cần nhiều model chuyên biệt phối hợp, phải tự xây logic điều phối.
- **Không tracing, không cost visibility:** Không biết bước nào tốn token, chạy bao lâu, lỗi ở đâu.
- **Khó mở rộng:** Thêm bước, thêm agent, hay thay đổi thứ tự xử lý yêu cầu sửa logic từ đầu.

Kết quả: các dự án AI thực tế thường kết thúc bằng một mớ `if/else` quấn quanh các LLM call — không scale, không maintain được.

---

## 2. What — LangGraph là gì?

LangGraph là framework để xây dựng AI agent workflows dưới dạng **đồ thị có hướng** (directed graph), trong đó:

- **Node** = một bước xử lý (gọi LLM, gọi tool, logic điều kiện…)
- **Edge** = luồng dữ liệu từ bước này sang bước khác
- **State** = object dùng chung, truyền qua toàn bộ graph, mỗi node đọc và ghi vào state

Thay vì viết code tuần tự `bước1() → bước2() → bước3()`, bạn khai báo graph: node nào nối với node nào, state trông như thế nào. LangGraph compile graph đó thành một executor có thể resume, replay, và trace từng bước.

Ví dụ workflow thực tế trong project này:

```
START → Manager → Dev → QA → END
```

State sau mỗi bước:

```
{ task, managerOutput, devOutput, qaOutput, results[] }
```

Mỗi node chỉ đọc phần state nó cần, ghi lại output của mình — không node nào biết đến node khác.

---

## 3. Why — Tại sao LangGraph thay vì prompt chaining hay function calling thuần túy?

### Prompt chaining thuần túy

Cách đơn giản nhất: gọi LLM, lấy output, nhét vào prompt tiếp theo. Vấn đề:

- State phải tự quản lý — dễ mất sync khi nhiều bước
- Không có cấu trúc: không biết đang ở bước nào, còn bao nhiêu bước
- Không thể rẽ nhánh hay lặp có điều kiện
- Khi debug, không biết bước nào sai

### Function calling (tool use)

Cho phép LLM tự chọn và gọi tool. Tốt cho agent đơn lẻ cần dùng tool, nhưng:

- Vẫn là single-agent: khó phân chia trách nhiệm rõ ràng
- Không kiểm soát được thứ tự thực thi
- Không có state machine: LLM tự quyết, không thể enforce flow

### LangGraph


| Tiêu chí         | Prompt chaining | Function calling | LangGraph   |
| ---------------- | --------------- | ---------------- | ----------- |
| State management | Manual          | Partial          | Built-in    |
| Control flow     | Không có        | LLM quyết        | Declarative |
| Multi-agent      | Khó             | Khó              | Native      |
| Observability    | Không           | Partial          | Full trace  |
| Retry / resume   | Phải tự làm     | Phải tự làm      | Có sẵn      |


---

## 4. How — Graph-based orchestration hoạt động thế nào?

LangGraph xây workflow theo 3 khái niệm:

**State schema:** Định nghĩa "bộ nhớ" chung của workflow. Mỗi field trong state có thể có reducer riêng — ví dụ mảng `results` tự động merge thay vì ghi đè.

```
State {
  task: string           // input gốc
  managerOutput: string  // kế hoạch từ Manager
  devOutput: string      // implementation từ Dev
  qaOutput: string       // review từ QA
  results: AgentResult[] // tất cả output, tích lũy qua từng bước
}
```

**Nodes:** Hàm async nhận state, trả về partial state update. Node không biết về node khác — chỉ đọc state nó cần, ghi output của mình.

**Edges:** Khai báo luồng dữ liệu. Có thể là cạnh tĩnh (`manager → dev`) hoặc cạnh động (conditional edge — node quyết định bước tiếp theo dựa trên output).

Khi `workflow.invoke()` được gọi:

1. LangGraph chạy node đầu tiên với state ban đầu
2. Merge partial update vào state
3. Theo edge, chạy node tiếp theo
4. Lặp cho đến khi đến `END`
5. Trả về state cuối cùng

---

## 5. Use — Xây agent flow trong thực tế

Trong project này, workflow gồm 3 agent chạy tuần tự:

**Manager Agent** nhận task mô tả thô từ user, trả về kế hoạch có cấu trúc: phân tích yêu cầu, các bước thực hiện, technical requirements, instructions cho Dev.

**Dev Agent** nhận task gốc + kế hoạch của Manager, viết implementation theo plan.

**QA Agent** nhận task gốc + kế hoạch Manager + implementation của Dev, review và đưa ra nhận xét.

Mỗi agent hoàn toàn độc lập — chỉ biết input của mình. Context từ bước trước được truyền qua state, không phải qua code coupling.

Ngoài ra, hệ thống hỗ trợ **pipeline động**: user có thể @mention các agent theo thứ tự tùy ý — chỉ `@Dev` để implement thẳng, hay `@QA @Dev` để review trước rồi implement. Pipeline được resolve từ thứ tự mention trong tin nhắn Discord.

---

## 6. Where — Multi-step workflows

LangGraph phù hợp nhất khi workflow có nhiều bước phụ thuộc nhau:

- **Software development pipeline:** Phân tích → Lập kế hoạch → Implement → Review → Test
- **Content pipeline:** Research → Draft → Edit → Publish
- **Data pipeline:** Extract → Transform → Validate → Load
- **Support workflow:** Classify → Retrieve context → Generate response → Escalate nếu cần

Trong tất cả các trường hợp này, output bước trước là input bước sau — và bạn cần control flow rõ ràng, không phải LLM tự quyết.

---

## 7. When — Khi nào nên dùng LangGraph?

**Nên dùng khi:**

- Workflow có nhiều hơn 2–3 bước phụ thuộc nhau
- Cần nhiều agent với vai trò khác nhau phối hợp
- Cần conditional routing: rẽ nhánh dựa trên output của model
- Cần tracing và observability chi tiết từng bước
- Workflow có thể thay đổi (thêm bước, đổi thứ tự) mà không muốn refactor toàn bộ code

**Không cần dùng khi:**

- Single agent, single LLM call
- Không cần state hoặc state rất đơn giản
- Workflow cố định 1–2 bước, không có branching

---

## 8. Trade-offs

### Complexity

LangGraph thêm một lớp abstraction. Với workflow đơn giản, nó có thể là over-engineering. Cần thời gian để hiểu model: state schema, reducers, edge types.

### Debugging

Khi có lỗi, phải trace qua graph để xác định node nào sai. Không có Langfuse, việc này khó hơn nhiều so với code tuần tự.

### Cost

Multi-agent = nhiều LLM call. Một task qua 3 agent có thể tốn token gấp 3–5 lần so với 1 call. Cần chiến lược tối ưu rõ ràng (xem phần Observability).

### Latency

Các bước chạy tuần tự cộng dồn latency. Nếu mỗi agent tốn 5–10 giây, 3 agent = 15–30 giây. Cần thiết kế pipeline hợp lý, chỉ thêm agent khi thực sự cần.

### Vendor dependency

LangGraph là thư viện của LangChain. Có learning curve và API thay đổi qua các version. Cần cân nhắc nếu muốn minimize dependencies.

---

## 9. Demo — Agent system

Hệ thống gồm 4 bot Discord, mỗi bot là một agent độc lập:

**Manager Bot** — nhận task, lập kế hoạch chi tiết.
**Dev Bot** — implement theo plan.
**QA Bot** — review implementation.
**Reporter Bot** — theo dõi tiến độ, trả lời truy vấn về task từ DB.

Flow khi user gửi task:

```
User @mention Manager Dev QA: "build a REST API for user auth"
       ↓
Discord bot nhận message, parse pipeline từ mention order
       ↓
Task được tạo trong PostgreSQL, job enqueue vào Manager queue
       ↓
Manager worker poll job → gọi Manager Agent → post kết quả Discord
       ↓
Enqueue vào Dev queue với context (task + managerOutput)
       ↓
Dev worker → Dev Agent → post kết quả Discord
       ↓
Enqueue vào QA queue với context (task + managerOutput + devOutput)
       ↓
QA worker → QA Agent → post kết quả Discord
       ↓
Task marked completed, Discord embed cập nhật
```

Mỗi agent nhận đúng context cần thiết, không hơn không kém. User thấy output từng agent realtime trên Discord.

---

## 10. Observability — Langfuse

Mỗi agent call được trace tự động qua Langfuse `CallbackHandler` tích hợp với LangChain. Ngoài ra, `LangfuseSpanProcessor` (OpenTelemetry) trace toàn bộ workflow bao gồm cả infrastructure code.

**Mỗi trace bao gồm:**

- Input / output của từng LLM call
- Model sử dụng, số token (input + output)
- Latency từng bước
- Cost tính theo giá model

**Metadata gắn vào mỗi trace:**

- `sessionId` — trace ID của task (end-to-end)
- `userId` — Discord user ID
- `tags` — `['pipeline', 'Manager']` v.v.
- `traceMetadata` — agent name, task ID, pipeline order

**Từ đó có thể phân tích:**

- Cost per task, cost per agent, cost per user
- Latency bottleneck ở agent nào
- Tỷ lệ lỗi và nguyên nhân
- So sánh cost khi đổi model hoặc provider

**Chiến lược tối ưu cost dựa trên data:**


| Chiến lược         | Mô tả                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Model tiering      | Agent đơn giản dùng model rẻ; agent phức tạp dùng model mạnh         |
| Provider selection | Qwen/Gemini cho task thường; OpenAI/Anthropic cho task quan trọng    |
| Prompt compression | Cắt context thừa, giữ phần model thực sự cần                         |
| Context pruning    | Chỉ load output của task được tham chiếu, không load toàn bộ lịch sử |
| Caching            | Semantic cache với pgvector cho câu hỏi tương tự                     |
| Token budgeting    | Giới hạn max_tokens để tránh output quá dài không cần thiết          |


