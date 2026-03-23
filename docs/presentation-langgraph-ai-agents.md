Xây dựng AI Agents: Thiết kế hệ thống, theo dõi và tối ưu chi phí

---

## 1. Problem — Vấn đề khi sử dụng các công cụ AI

- **Quản lí state:** LLM, Tool không nhớ gì giữa các lần gọi và người dùng phải tự quản lý, hoặc state giữa các lần gọi có thể bị lẫn lộn làm ảnh hưởng kết quả cho bước sau.
- **Control flow:** Khó có thể phân nhánh, loop, retry hay dừng có điều kiện dựa trên nhiều điều kiện như output model llm, state từ bên ngoài, data trong hệ thống.
- **Kết hợp nhiều agent:** Sẽ gặp khó khăn nếu cần nhiều model chuyên biệt phối hợp trong từng hoàn cảnh cụ thể, lúc này sẽ phải thực hiện thủ công hoặc viết thêm logic khiến flow phức tạp hơn
- **Tracing, Cost control:** Khó để phát hiện biết bước nào tốn token, system prompt, memory sinh ra thêm từ đâu, bị update lúc nào, chạy bao lâu, vấn đề phát sinh từ đâu.
- **Mở rộng:** Flow thêm bước, thêm công cụ tuỳ chỉnh, thêm agent, hay thay đổi thứ tự xử lý có thể gặp sẽ khó khăn hoặc việc mở rộng phụ thuộc vào tài nguyên phần mềm cho sẵn

---

## 2. LangChain & LangGraph là gì?

### LangChain

LangChain là framework để kết nối LLM với các thành phần bên ngoài: tool, memory, data source, callback…

Những gì LangChain cung cấp:

- **LLM providers:** Abstraction thống nhất cho OpenAI, Anthropic, Gemini, Qwen — đổi provider không cần sửa code
- **Prompt templates:** Quản lý system prompt, few-shot, template có biến
- **Callback / tracing:** Hook vào mọi LLM call để log, trace, đo token
- **Memory & retrieval:** ConversationMemory, VectorStore retriever cho RAG

Phù hợp cho: single agent, single LLM call, chuỗi prompt đơn giản.

### LangGraph

LangGraph xây dựng trên LangChain, giải quyết bài toán LangChain chưa tập trung vào: **multi-step, multi-agent, stateful workflow**.

Thay vì viết code tuần tự `bước1() → bước2() → bước3()`, bạn khai báo workflow dưới dạng **đồ thị có hướng** (directed graph):

- **Node** = một bước xử lý (gọi LLM, gọi tool, logic điều kiện…)
- **Edge** = luồng dữ liệu từ bước này sang bước khác
- **State** = object dùng chung, truyền qua toàn bộ graph, mỗi node đọc và ghi vào state

LangGraph compile graph đó thành một executor có thể resume, replay, và trace từng bước.

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

## 3. Tại sao LangGraph thay vì prompt chaining hay function calling thuần túy?

### Prompt chaining

Gọi LLM, lấy tất cả input - output, nhét vào prompt tiếp theo. Vấn đề:

- State, memory: prompt cồng kềnh, không tối ưu, phải tự quản lý, dễ mất đồng bộ khi flow có nhiều bước
- Cấu trúc: gặp khó khăn để xác định đang ở bước nào, còn bao nhiêu bước, quan sát khi flow có rẽ nhánh hay lặp có điều kiện
- Debug: mất nhiều thời gian để xác định bước nào sai, bước nào gặp vấn đề

### Function calling (tool use)

Cho phép LLM tự chọn và gọi tool. Tốt cho agent đơn lẻ cần dùng tool, nhưng:

- Thực thi: không thể dự đoán chính xác được output và từ đó khó kiểm soát flow
- State machine: LLM tự quyết, không thể can thiệp vào những phần giữa flow, có rủi ro bị tấn công nếu tool tích hợp những quyền nhạy cảm như sửa file, đọc file, chạy code,..

### So sánh chung


| Tiêu chí         | Prompt chaining | Function calling | LangGraph   |
| ---------------- | --------------- | ---------------- | ----------- |
| State management | Manual          | Partial          | Built-in    |
| Control flow     | Manual          | LLM quyết        | Declarative |
| Multi-agent      | Khó             | Khó              | Native      |
| Observability    | Không           | Partial          | Full trace  |
| Retry / resume   | Phải tự làm     | Phải tự làm      | Có sẵn      |


---

## 4. Graph-based orchestration hoạt động thế nào?

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

## 5. When — Khi nào nên dùng LangGraph?

**Nên dùng khi:**

- Workflow có nhiều bước và phụ thuộc nhau, phụ thuộc vào nhiều trạng thái khác và cần chia nhỏ 
- Cần nhiều agent với vai trò khác nhau phối hợp, có rẽ nhánh flow, rẽ nhánh model cho các trường hợp
- Cần trace, optimize chi tiết từng bước
- Workflow có thể thay đổi và cập nhật phức tạp hơn về sau

Ví dụ:

- **Software development pipeline:** Phân tích → Lập kế hoạch → Chia nhỏ task → Implement → Review → Test

**Không cần dùng khi:**

- Agent đơn lẻ, gọi tool thực thi, truy vấn đơn giản
- Không cần state hoặc state rất đơn giản
- Workflow ngắn, thẳng, cố định, không rẽ nhánh, không loop, không retry phức tạp

---

## 6. Use — Xây agent flow trong thực tế

Trong project này, workflow gồm 3 agent chạy tuần tự:

**Manager Agent** nhận task mô tả thô từ user, trả về kế hoạch có cấu trúc: phân tích yêu cầu, các bước thực hiện, technical requirements, instructions cho Dev.

**Dev Agent** nhận task gốc + kế hoạch của Manager, viết implementation theo plan.

**QA Agent** nhận task gốc + kế hoạch Manager + implementation của Dev, review và đưa ra nhận xét.

Mỗi agent hoàn toàn độc lập — chỉ biết input của mình. Context từ bước trước được truyền qua state, không phải qua code coupling.

Ngoài ra, hệ thống hỗ trợ **pipeline động**: user có thể @mention các agent theo thứ tự tùy ý — chỉ `@Dev` để implement thẳng, hay `@QA @Dev` để review trước rồi implement. Pipeline được resolve từ thứ tự mention trong tin nhắn Discord.

---

## 7. Trade-offs

### Complexity

Với workflow đơn giản, nó có thể là over-engineering.  
Cần thời gian để hiểu framework: node, state schema, edge type,...  
Tự setup infrastructure xoay quanh để phục vụ hệ thống agents  
→ Cần biết thêm về infra liên quan để có thể setup hoành chỉnh  
→ Mất nhiều thời gian để cho ra 1 prototype workflow

### Cost

Multi-agent = nhiều LLM call.  
Một task đơn giản mà vẫn đi qua 3 agent có thể tốn token gấp 3–5 lần so với 1 call.  
Cần chiến lược tối ưu rõ ràng.

---

## 8. Demo — Agent system

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

## 9. Observability — Langfuse

Mỗi agent call được trace tự động qua Langfuse`CallbackHandler` tích hợp với LangChain. Ngoài ra, `LangfuseSpanProcessor`trace toàn bộ workflow bao gồm cả infrastructure code.

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


