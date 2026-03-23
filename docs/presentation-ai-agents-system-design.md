# Văn bản thuyết trình: Xây dựng AI Agents — Thiết kế hệ thống, theo dõi và tối ưu chi phí

---

## 1. Các vấn đề khi sử dụng AI?

Khi dùng ChatGPT trực tiếp để xử lý công việc trong hệ thống thực tế, bạn gặp nhiều hạn chế:

**Scalability:** ChatGPT là giao diện chat 1-1, không được thiết kế để scale cho nhiều người dùng đồng thời hay xử lý hàng loạt task. Hệ thống agent có thể có queue, load balancing, và xử lý song song theo quy trình được định nghĩa rõ ràng.

**Observability:** Bạn không biết model được gọi khi nào, tốn bao nhiêu token, ở bước nào, output ra sao. Với agent, mọi LLM call đều trace được theo task, user, session — giúp debug, audit và tối ưu.

**Cost control:** Chi phí không dự đoán được, không gán được cho team/project, không set limit. Hệ thống agent có thể track cost theo task, theo agent, theo user — từ đó budget, báo cảnh, giới hạn.

**Tự động hóa quy trình khép kín:** ChatGPT trả lời từng câu hỏi, người dùng phải điều khiển từng bước. Thực tế cần quy trình nhiều bước: phân tích → lập kế hoạch → thực hiện → review → báo cáo. Agent cho phép định nghĩa workflow cố định, tự động chạy từ đầu đến cuối.

**Persistency và context:** Chat không lưu lâu dài, khó tái sử dụng kết quả task trước cho task mới. Agent có thể lưu task, output từng agent, và load context khi user tham chiếu (ví dụ: "tiếp tục từ task #123").

**Reliability và multi-tenancy:** Nhiều channel, nhiều người dùng cần xử lý độc lập, tránh trùng lặp, có retry khi lỗi. Agent với queue và persistence giúp kiểm soát điều này.

Tóm lại, xây AI agent system là để kiểm soát được workflow, chi phí, observability và scale — thay vì phụ thuộc vào chat UI.

### Khi nào dùng Chat UI, OpenClaw (ClawDBot), khi nào dùng LangGraph?

| Phương án | Phù hợp khi | Hạn chế chính |
|-----------|-------------|---------------|
| **Chat UI** (ChatGPT, Claude.ai, v.v.) | Thử nghiệm nhanh, trò chuyện 1–1, demo concept, không cần automation hay tracking. | Không scale, không observability, không kiểm soát chi phí, workflow do người dùng điều khiển từng bước. |
| **OpenClaw (ClawDBot)** | Cần bot AI đa nền tảng (Discord, Telegram, Slack…) với nhiều skill sẵn; triển khai nhanh; không cần custom workflow phức tạp; chấp nhận "hộp đen". | Ít kiểm soát quy trình, khó trace cost theo task, workflow mặc định, khó custom cho nghiệp vụ riêng. |
| **LangGraph** (custom agent system) | Cần workflow đa bước, multi-agent, rẽ nhánh conditional, chạy song song; cần kiểm soát cost, observability và scale; có quy trình nghiệp vụ cụ thể (phân tích → lập kế hoạch → thực hiện → review). | Phức tạp hơn, cần tự xây hạ tầng; nhưng kiểm soát tối đa. |

### Khi nào nên dùng LangGraph?

- **Workflow nhiều bước có điều kiện:** Cần rẽ nhánh theo kết quả (vd: đủ thông tin thì tiếp tục, thiếu thì hỏi thêm hoặc báo lỗi).
- **Multi-agent:** Nhiều agent với vai trò khác nhau (vd: manager → dev → QA) cần phối hợp theo trình tự trong một pipeline.
- **Cần chạy song song hoặc vòng lặp:** Một số bước chạy song song, hoặc lặp lại cho đến khi thỏa mãn điều kiện.
- **Cần debug và trace rõ ràng:** Mỗi bước là một node, dễ trace input/output, cost, latency theo từng node.
- **Cần persistence và checkpoint:** Lưu state giữa chừng, cho phép resume khi gián đoạn hoặc retry theo từng đoạn.
- **Yêu cầu observability và kiểm soát chi phí:** Ghép với Langfuse/OpenTelemetry để trace end-to-end theo task, user, agent.

**Khi không cần LangGraph:** Chat đơn giản một vòng (user gửi → model trả lời), chatbot không có workflow phức tạp, hoặc dùng OpenClaw/solution có sẵn đủ nhu cầu. Trong trường hợp đó, LangChain chain đơn giản hoặc API gọi trực tiếp thường đủ và đơn giản hơn.

---

## 2. Tại sao chọn core stack này?

**LangGraph:** Mô hình hóa workflow dưới dạng state machine rõ ràng — dễ mở rộng, thêm nhánh conditional, chạy song song. Phù hợp cho multi-agent với nhiều bước.

**PostgreSQL + pgvector:** Một DB cho cả persistence thông thường (task, job, message) và vector search (memory dài hạn, semantic search). Không cần thêm vector store riêng.

**Langfuse:** Tracing LLM calls, cost tracking theo token, tích hợp OpenTelemetry. Giúp debug và tối ưu mà không phải tự xây hạ tầng đo lường.

**Multi-LLM (OpenAI, Anthropic, Qwen, Gemini):** Tránh vendor lock-in, so sánh cost và chất lượng, chọn model phù hợp theo task hoặc budget.

---

## 3. Các thành phần hệ thống cần kiểm soát

### 3.1 LangGraph workflow

Workflow định nghĩa luồng xử lý: các node (agent hay bước xử lý), state shared (input, output từng bước, kết quả cuối), và cạnh nối giữa các node. Kiểm soát workflow = kiểm soát logic: bước nào chạy trước, rẽ nhánh ở đâu, khi nào kết thúc.

### 3.2 Memory ngắn hạn

Bao gồm state trong một lần chạy workflow: input task, output từng agent, context truyền giữa các bước. Memory ngắn hạn chỉ tồn tại trong một execution và truyền thông tin giữa các agent.

### 3.3 Memory dài hạn

Lưu lịch sử task, output agent, embedding cho semantic search. Memory dài hạn cho phép tái sử dụng kết quả quá khứ, tham chiếu task cũ, tìm kiếm theo ngữ nghĩa.

### 3.4 System prompt

Mỗi agent có system prompt riêng quy định vai trò, format output, ràng buộc. Kiểm soát system prompt = kiểm soát hành vi mà không cần sửa code, có thể version, A/B test.

### 3.5 Role và tool (skill) của agent

Mỗi agent có **role** rõ ràng — vai trò cụ thể như lập kế hoạch, implement, review, báo cáo. Role được định nghĩa qua system prompt và vị trí trong workflow.

**Tool (skill)** là khả năng đặc thù: gọi API ngoài, truy vấn DB, tìm kiếm vector, thao tác file. Một agent có thể có nhiều tools; tùy task mà chọn tool phù hợp. Skill giúp agent không chỉ "nói" mà còn "làm" — tra cứu dữ liệu, thực hiện hành động cụ thể.

Kiểm soát role và tool nghĩa là: mỗi agent biết mình làm gì, có những kỹ năng gì, và khi nào được gọi — từ đó quyết định cấu trúc pipeline và phân chia nhiệm vụ.

---

## 4. Tracking, monitoring và tối ưu chi phí

**Tracking:** Ghi lại mỗi lần gọi LLM — input, output, model, token. Gắn trace ID theo task hoặc session để theo dõi end-to-end. Metadata như user, channel, loại task giúp filter và phân tích theo nhiều chiều.

**Monitoring:** Dashboard hiển thị cost theo thời gian, theo agent, theo user; latency từng bước và toàn workflow; tỷ lệ lỗi, retry. Kết hợp log và OpenTelemetry để phân tích sự cố.

**Tối ưu chi phí:** Dựa vào dữ liệu tracking để áp dụng các chiến lược dưới đây, thử nghiệm và đo lường hiệu quả.

---

## 5. Các chiến lược tối ưu chi phí

**Model tiering:** Dùng model rẻ hơn cho task đơn giản, model mạnh hơn cho task phức tạp. Phân loại task theo độ khó hoặc theo agent để chọn model phù hợp.

**Provider fallback:** Hỗ trợ nhiều nhà cung cấp LLM để chọn theo cost, độ sẵn sàng, chất lượng. Ví dụ: task thường dùng Qwen/Gemini, task quan trọng dùng OpenAI/Anthropic.

**Prompt compression:** Rút gọn system prompt và context — loại bỏ phần thừa nhưng vẫn giữ đủ thông tin để model hoạt động đúng.

**Context pruning:** Chỉ đưa vào prompt phần context cần thiết. Với task có tham chiếu, chỉ load output của các task được tham chiếu thay vì load toàn bộ lịch sử.

**Caching:** Cache kết quả cho câu hỏi hoặc context tương tự (semantic cache dùng vector search) — giảm lần gọi LLM trùng lặp.

**Queue và batching:** Dùng hàng đợi để tránh gọi LLM dư thừa; có thể nhóm các request nhỏ khi phù hợp để tận dụng batch API.

**Token budgeting:** Đặt giới hạn input/output (max_tokens) để tránh chi phí vọt khi model sinh output quá dài.

---

Tóm lại, xây hệ thống AI agent cần chú ý: giải quyết đúng các vấn đề scalability, observability và cost; chọn stack phù hợp; kiểm soát workflow, memory, prompt, role và tool; và theo dõi cùng tối ưu chi phí bằng các chiến lược có chủ đích.
