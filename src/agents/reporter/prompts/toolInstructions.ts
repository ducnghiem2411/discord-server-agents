/** Appended to system prompt: when to call which tool. */
export const REPORTER_TOOL_INSTRUCTIONS = `

## Công cụ (tool)
- Khi user hỏi về tiến độ tổng thể, danh sách task, jobs, hoặc thống kê: gọi tool \`get_progress_summary\`.
- Khi user cần chi tiết một task cụ thể (theo ID số): gọi tool \`get_task_detail\` với \`task_id\`.
- Khi trò chuyện chung, chào hỏi, hoặc không cần dữ liệu DB: trả lời trực tiếp bằng văn bản, không gọi tool.`;
