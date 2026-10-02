# Tích hợp API từ public-apis — 02/10/2026

Đối chiếu [public-apis/public-apis](https://github.com/public-apis/public-apis) và tài liệu chính thức. Chọn dịch vụ theo nhu cầu đọc bảng học bạ tiếng Việt và tư vấn dựa trên dữ liệu trường của website; không đăng ký mọi mục AI chỉ vì có tên trong danh sách.

## Đã nối và cấu hình

| Dịch vụ | Trợ lý tư vấn | Quét học bạ | Kiểm chứng thực tế |
|---|---|---|---|
| Gemini | Bổ sung, dùng các key Gemini hiện có; model chat riêng | Giữ luồng hiện có, chuyển model mặc định sang `gemini-3.5-flash-lite` | Chat có ngữ cảnh 6 thẻ ngành trả lời thành công; 3 ảnh đọc đúng 81/81 ô điểm |
| Hugging Face | Bổ sung token chỉ có quyền Inference Providers, model `Qwen/Qwen3-4B-Instruct-2507:nscale` | Có adapter, **tắt mặc định** | Chat có ngữ cảnh 6 thẻ thành công sau 12–16 giây. Model ảnh 2.5-VL-3B bị router từ chối; Qwen3.8 qua DeepInfra quá 45 giây trên bộ 3 ảnh |
| Requesty | Bổ sung key chỉ gọi completions; model free `google/gemma-4-31b-it` | Có adapter, **tắt mặc định**, chưa gửi ảnh học bạ | Chat có ngữ cảnh 6 thẻ thành công sau khoảng 35 giây, tài khoản không nạp tiền |
| Groq / OCR.space | Giữ cấu hình đã có | Gemini → Groq → OCR.space → Tesseract/nhập tay | Bộ ảnh Groq đã đạt 81/81 trong đợt trước |
| Cloudflare Workers AI / Mistral / OpenRouter | Giữ cấu hình đã có | Không thêm luồng OCR mới trong đợt này | Các kiểm thử hiện có được giữ |

Gemini 2.5 trong cấu hình cũ trả HTTP 404 cho key đang thử, với thông báo model không còn khả dụng cho người dùng mới. Model 3.5 được xác nhận bằng gọi API thật, không chỉ dựa vào tên trong catalog. [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [pricing/model hiện hành](https://ai.google.dev/gemini-api/docs/pricing).

Hugging Face free có credit nhỏ, hiện $0,10/tháng; hết credit sẽ chuyển dịch vụ, không tự mua thêm. Một model ở Hub không bảo đảm router hỗ trợ model đó cho tài khoản hoặc provider đã chọn. [Chat/vision](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion), [pricing](https://huggingface.co/docs/inference-providers/en/pricing).

Requesty free models có giới hạn theo organization, hiện 200 request/ngày và 20 RPM cho organization mới. Key không tự tăng quota. Free account và upstream có chính sách lưu trữ/huấn luyện riêng; chưa bật gửi học bạ ở đó. [Free models](https://docs.requesty.ai/features/free-models), [privacy](https://www.requesty.ai/privacy).

## Cách tích hợp

- Dùng lại pool khóa và cơ chế đổi provider hiện có, thêm Gemini/HF/Requesty sau các provider tư vấn cũ. Khóa, model và endpoint chỉ được chọn ở backend.
- Chat nhận ngữ cảnh tuyển sinh đã chuẩn hóa từ website. Không thêm tìm kiếm web tự do hay cho model tự tạo số liệu tuyển sinh.
- OCR dùng validator bảng điểm chung, luôn bỏ tên học sinh khỏi kết quả. Người dùng phải đồng ý trước khi gửi ảnh và xác nhận bảng điểm trước khi điền.
- Adapter HF/Requesty OCR chỉ đăng ký khi có key **và** `${PREFIX}_VISION_MODEL` không rỗng. `.env.example` để cả hai model ảnh trống.
- Không thêm dependency; các adapter sử dụng `fetch` và các phần dùng chung đã có. Định dạng API/bảng điểm giữ nguyên.

## Những dịch vụ chưa phù hợp để bật

| Dịch vụ | Lý do |
|---|---|
| Jina | Reader/rerank hữu ích khi có nhu cầu lấy nguồn mới; luồng hiện tại đã đưa toàn bộ các thẻ tìm được vào chat. OCR mới chưa được chứng minh đọc học bạ Việt Nam. [OCR](https://jina.ai/news/jina-ocr-v1-faster-document-parsing-on-low-budget-gpus/) |
| onomeo | FAQ chính thức không khuyến nghị production; có lưu đoạn prompt/response. [Docs](https://onomeo.com/docs) |
| TokenRoute | Tính phí từng request và yêu cầu credit. [Docs](https://tokenroute.app/docs/quickstart) |
| NLP Cloud / DeepAI | Trial hoặc gói API trả phí, không đủ cơ sở chọn cho phương án miễn phí lâu dài. [NLP Cloud](https://nlpcloud.com/pricing.html), [DeepAI](https://deepai.org/docs) |
| Cloudmersive | Có OCR tiếng Việt nhưng lấy key free cần thẻ; xử lý ảnh nâng cao tiêu hao nhiều call. Không đăng ký billing. [OCR docs](https://api.cloudmersive.com/docs/ocr.asp) |
| Clarifai / Hirak / GoldBean | Chưa xác minh đủ quyền API, model, chi phí hoặc chất lượng đọc bảng tiếng Việt để đưa vào production |
| Dialogflow | Nền tảng xây intent/luồng hội thoại; không bổ sung trực tiếp một nguồn trả lời phù hợp cho bot hiện tại |

Azure, Google Cloud Vision/Document AI và Mistral OCR không thuộc danh sách được yêu cầu trong đợt này; không tạo thêm tài khoản trả phí. Mistral chat hiện có vẫn giữ.

## Giới hạn cần biết

Quota tính theo project/account/organization, không tăng đơn giản bằng thêm key. Không có cam kết API miễn phí vô hạn. HF dùng credit của tài khoản, không có nghĩa inference có giá bằng 0. Cấu hình HF đã chuyển từ `:cheapest` sang `:nscale` sau khi tuyến cũ quá hạn với câu hỏi dài.

Requesty Gemma sử dụng ngân sách completion cho cả reasoning và câu trả lời; budget 400 chỉ trả reasoning, không có content. Giữ model free, nâng budget lên 1600 và timeout 40 giây, kiểm thử thành công với câu hỏi dài. Không hiển thị reasoning thay cho câu trả lời. `reasoning_effort=none` vẫn gửi theo tài liệu, nhưng không giả định upstream sẽ bỏ hoàn toàn reasoning.

Frontend tư vấn chờ tối đa 45 giây để nhận model free chậm hơn; backend có thể thử nhiều key/provider, mỗi lần có timeout riêng. Nếu nhiều provider liên tiếp treo, UI vẫn có thể chuyển về câu trả lời local trước khi backend đi hết chuỗi. Chuyển provider khi quota/auth trả lỗi nhanh đã được kiểm thử; không cam kết mọi chuỗi timeout đều hoàn thành trong 45 giây.

Các lần gọi API thật và các ca mock được tách rõ trong [báo cáo kiểm thử](../testing/extra-ai-2026-10-02.md).
