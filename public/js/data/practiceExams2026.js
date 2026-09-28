import { OFFICIAL_PRACTICE_EXAMS_2026 } from "./officialPracticeExams2026.js";

const q = (id, prompt, options, answer, explanation) => ({ id, prompt, options, answer, explanation });
const exam = (id, subject, category, icon, officialMinutes, questions, note = "") => ({
  id,
  subject,
  category,
  icon,
  officialMinutes,
  durationMinutes: questions.length <= 5 ? 12 : 18,
  title: "Đề luyện nhanh số 01",
  note,
  questions
});

export const PRACTICE_EXAM_SOURCE = {
  label: "Cấu trúc định dạng đề thi từ năm 2025 — Cục Quản lý chất lượng",
  url: "https://vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html"
};

const ORIGINAL_PRACTICE_EXAMS_2026 = [
  exam("math-01", "Toán", "Bắt buộc", "∑", 90, [
    q("m1", "Đạo hàm của hàm số y = x² − 3x + 1 tại x = 2 bằng bao nhiêu?", ["−1", "0", "1", "2"], 2, "y' = 2x − 3. Thay x = 2 được y'(2) = 1."),
    q("m2", "Tổng hai nghiệm của phương trình x² − 5x + 6 = 0 là", ["−5", "5", "6", "−6"], 1, "Theo hệ thức Viète, tổng hai nghiệm bằng −b/a = 5."),
    q("m3", "Giá trị của ∫₀¹ 2x dx là", ["1/2", "1", "2", "3"], 1, "Nguyên hàm của 2x là x²; x²|₀¹ = 1."),
    q("m4", "Một hộp có 2 bi đỏ và 3 bi xanh. Lấy ngẫu nhiên một bi. Xác suất lấy bi đỏ là", ["2/3", "2/5", "3/5", "1/2"], 1, "Có 2 kết quả thuận lợi trong tổng số 5 viên bi nên xác suất là 2/5."),
    q("m5", "log₂8 bằng", ["2", "3", "4", "8"], 1, "Vì 2³ = 8 nên log₂8 = 3."),
    q("m6", "Tích vô hướng của hai vectơ (1; 2) và (3; −1) bằng", ["−1", "0", "1", "5"], 2, "1·3 + 2·(−1) = 1."),
    q("m7", "Thể tích khối lập phương cạnh 3 cm bằng", ["9 cm³", "18 cm³", "27 cm³", "36 cm³"], 2, "V = a³ = 3³ = 27 cm³."),
    q("m8", "Cấp số cộng có u₁ = 2, công sai d = 3. Giá trị u₅ là", ["11", "12", "14", "17"], 2, "u₅ = u₁ + 4d = 2 + 12 = 14.")
  ], "Đề rút gọn kiểm tra nhanh kiến thức cốt lõi."),

  exam("literature-01", "Ngữ văn", "Bắt buộc", "V", 120, [
    q("v1", "Trong câu “Mặt trời xuống biển như hòn lửa”, biện pháp tu từ chính là", ["Ẩn dụ", "So sánh", "Hoán dụ", "Nói quá"], 1, "Từ “như” tạo phép so sánh trực tiếp giữa mặt trời và hòn lửa."),
    q("v2", "Thành phần nào nêu vấn đề trung tâm cần bàn luận trong bài nghị luận?", ["Luận đề", "Dẫn chứng", "Thao tác lập luận", "Từ nối"], 0, "Luận đề là vấn đề trung tâm mà toàn bộ bài viết tập trung làm sáng tỏ."),
    q("v3", "Câu “Bạn đã chuẩn bị hành trang cho tương lai chưa?” thuộc kiểu câu nào theo mục đích nói?", ["Câu cầu khiến", "Câu nghi vấn", "Câu cảm thán", "Câu trần thuật"], 1, "Câu dùng từ nghi vấn “chưa” và dấu hỏi để hỏi người đọc."),
    q("v4", "Yêu cầu quan trọng nhất khi trích dẫn ý kiến của người khác là", ["Viết thật dài", "Ghi đúng và nêu nguồn", "Chỉ dùng nguồn mạng xã hội", "Không cần đặt trong ngữ cảnh"], 1, "Trích dẫn cần chính xác, có nguồn và được dùng đúng ngữ cảnh."),
    q("v5", "Một đoạn văn có các câu cùng hướng về một ý chính đạt yêu cầu nào?", ["Liên kết hình thức", "Thống nhất chủ đề", "Dùng nhiều từ Hán Việt", "Có nhiều câu dài"], 1, "Các câu cùng làm rõ một ý chính tạo nên sự thống nhất về chủ đề.")
  ], "Phần luyện nhanh tập trung đọc hiểu và tiếng Việt; bài thi chính thức có phần viết tự luận."),

  exam("physics-01", "Vật lí", "Tự chọn", "⚡", 50, [
    q("p1", "Đặt hiệu điện thế 12 V vào điện trở 6 Ω. Cường độ dòng điện là", ["0,5 A", "2 A", "6 A", "72 A"], 1, "Theo định luật Ohm: I = U/R = 12/6 = 2 A."),
    q("p2", "Đơn vị SI của công suất là", ["Joule", "Newton", "Watt", "Volt"], 2, "Công suất có đơn vị watt, kí hiệu W."),
    q("p3", "Sóng điện từ truyền trong chân không với tốc độ xấp xỉ", ["3·10⁶ m/s", "3·10⁸ m/s", "3·10¹⁰ m/s", "340 m/s"], 1, "Tốc độ ánh sáng trong chân không là khoảng 3·10⁸ m/s."),
    q("p4", "Một vật khối lượng 2 kg chuyển động với tốc độ 3 m/s. Động năng là", ["3 J", "6 J", "9 J", "18 J"], 2, "Wđ = 1/2·m·v² = 1/2·2·9 = 9 J."),
    q("p5", "Hiện tượng ánh sáng tách thành nhiều màu khi qua lăng kính gọi là", ["Giao thoa", "Nhiễu xạ", "Tán sắc", "Phản xạ toàn phần"], 2, "Chiết suất phụ thuộc bước sóng làm ánh sáng trắng bị tách màu: hiện tượng tán sắc.")
  ]),

  exam("chemistry-01", "Hóa học", "Tự chọn", "⚗", 50, [
    q("c1", "Số proton trong nguyên tử carbon (Z = 6) là", ["6", "12", "18", "3"], 0, "Số hiệu nguyên tử Z bằng số proton, nên carbon có 6 proton."),
    q("c2", "Dung dịch có pH = 3 thuộc môi trường", ["Axit", "Bazơ", "Trung tính", "Không xác định"], 0, "Dung dịch có pH < 7 là môi trường axit."),
    q("c3", "Chất nào là ancol?", ["CH₃COOH", "C₂H₅OH", "CH₃CHO", "C₆H₆"], 1, "C₂H₅OH là ethanol, thuộc nhóm ancol."),
    q("c4", "Trong phản ứng oxi hóa – khử, chất khử là chất", ["Nhận electron", "Nhường electron", "Không đổi số oxi hóa", "Tạo kết tủa"], 1, "Chất khử nhường electron và bản thân bị oxi hóa."),
    q("c5", "Khối lượng mol của H₂O là", ["16 g/mol", "17 g/mol", "18 g/mol", "20 g/mol"], 2, "M(H₂O) = 2·1 + 16 = 18 g/mol.")
  ]),

  exam("biology-01", "Sinh học", "Tự chọn", "DNA", 50, [
    q("b1", "Đơn phân cấu tạo nên protein là", ["Nucleotide", "Amino acid", "Monosaccharide", "Glycerol"], 1, "Protein là polymer được cấu tạo từ các amino acid."),
    q("b2", "Quá trình tổng hợp RNA từ khuôn DNA gọi là", ["Nhân đôi", "Phiên mã", "Dịch mã", "Đột biến"], 1, "Phiên mã dùng một mạch DNA làm khuôn để tổng hợp RNA."),
    q("b3", "Ở người, bộ nhiễm sắc thể lưỡng bội có", ["23 chiếc", "44 chiếc", "46 chiếc", "48 chiếc"], 2, "Tế bào sinh dưỡng người có 23 cặp, tức 46 nhiễm sắc thể."),
    q("b4", "Bào quan thực hiện quang hợp ở thực vật là", ["Ti thể", "Lục lạp", "Ribosome", "Lysosome"], 1, "Lục lạp chứa hệ sắc tố và enzyme phục vụ quang hợp."),
    q("b5", "Quan hệ cả hai loài cùng có lợi là", ["Cạnh tranh", "Kí sinh", "Cộng sinh", "Ức chế"], 2, "Trong quan hệ cộng sinh, hai loài sống gần nhau và cùng nhận lợi ích.")
  ]),

  exam("history-01", "Lịch sử", "Tự chọn", "⌛", 50, [
    q("h1", "Cách mạng tháng Tám năm 1945 thành công đã dẫn tới sự ra đời của", ["Đảng Cộng sản Việt Nam", "Nước Việt Nam Dân chủ Cộng hòa", "Mặt trận Việt Minh", "ASEAN"], 1, "Ngày 2/9/1945, nước Việt Nam Dân chủ Cộng hòa được tuyên bố thành lập."),
    q("h2", "Hiệp định Genève về Đông Dương được kí năm", ["1945", "1954", "1968", "1973"], 1, "Hiệp định Genève về Đông Dương được kí tháng 7/1954."),
    q("h3", "Đại hội VI của Đảng năm 1986 gắn với đường lối", ["Công nghiệp hóa thời chiến", "Đổi mới", "Đóng cửa kinh tế", "Phi thực dân hóa"], 1, "Đại hội VI khởi xướng đường lối đổi mới toàn diện đất nước."),
    q("h4", "Liên hợp quốc chính thức thành lập vào năm", ["1919", "1945", "1949", "1955"], 1, "Hiến chương Liên hợp quốc có hiệu lực ngày 24/10/1945."),
    q("h5", "ASEAN được thành lập tại", ["Bangkok", "Jakarta", "Hà Nội", "Manila"], 0, "ASEAN ra đời ngày 8/8/1967 với Tuyên bố Bangkok.")
  ]),

  exam("geography-01", "Địa lí", "Tự chọn", "◎", 50, [
    q("g1", "Việt Nam nằm trong khu vực khí hậu chủ yếu nào?", ["Ôn đới hải dương", "Nhiệt đới ẩm gió mùa", "Cận cực", "Hoang mạc"], 1, "Vị trí địa lí và hoạt động gió mùa tạo nên tính chất nhiệt đới ẩm gió mùa."),
    q("g2", "Đồng bằng có diện tích lớn nhất Việt Nam là", ["Đồng bằng sông Hồng", "Đồng bằng sông Cửu Long", "Đồng bằng Thanh Hóa", "Đồng bằng ven biển miền Trung"], 1, "Đồng bằng sông Cửu Long rộng khoảng 40 nghìn km², lớn nhất nước."),
    q("g3", "Khoáng sản nổi bật của thềm lục địa phía Nam là", ["Than đá", "Dầu khí", "Sắt", "Apatit"], 1, "Các bể trầm tích ngoài khơi phía Nam có trữ lượng dầu khí đáng kể."),
    q("g4", "Loại biểu đồ phù hợp nhất để thể hiện cơ cấu tại một thời điểm là", ["Tròn", "Đường", "Miền", "Kết hợp"], 0, "Biểu đồ tròn thường dùng để thể hiện cơ cấu của tổng thể tại một hoặc vài thời điểm."),
    q("g5", "Vùng chuyên canh cà phê lớn nhất nước ta là", ["Đông Nam Bộ", "Tây Nguyên", "Trung du miền núi Bắc Bộ", "Đồng bằng sông Hồng"], 1, "Đất badan và khí hậu cao nguyên tạo điều kiện cho cà phê phát triển mạnh ở Tây Nguyên.")
  ]),

  exam("economic-law-01", "Giáo dục kinh tế và pháp luật", "Tự chọn", "§", 50, [
    q("e1", "Quy luật cung cho biết khi giá hàng hóa tăng, các yếu tố khác không đổi, lượng cung thường", ["Giảm", "Tăng", "Không đổi", "Bằng không"], 1, "Giá tăng tạo động lực để người sản xuất cung ứng nhiều hơn."),
    q("e2", "Công dân đủ bao nhiêu tuổi trở lên có quyền bầu cử theo quy định chung?", ["16", "18", "20", "21"], 1, "Công dân đủ 18 tuổi trở lên có quyền bầu cử, trừ trường hợp luật định."),
    q("e3", "Hành vi tuân thủ pháp luật là", ["Làm điều pháp luật cấm", "Không làm điều pháp luật cấm", "Dùng quyền khi thích", "Trốn tránh nghĩa vụ"], 1, "Tuân thủ pháp luật thể hiện ở việc kiềm chế, không thực hiện hành vi bị cấm."),
    q("e4", "Khoản tiền người lao động nhận theo thỏa thuận để thực hiện công việc là", ["Thuế", "Tiền lương", "Lợi nhuận", "Lệ phí"], 1, "Tiền lương là khoản người sử dụng lao động trả theo thỏa thuận để người lao động làm việc."),
    q("e5", "Cạnh tranh lành mạnh có vai trò", ["Loại bỏ mọi doanh nghiệp nhỏ", "Thúc đẩy đổi mới và nâng cao chất lượng", "Làm mất quyền lựa chọn", "Ngăn cản sản xuất"], 1, "Cạnh tranh lành mạnh khuyến khích đổi mới, giảm chi phí và cải thiện chất lượng.")
  ]),

  exam("informatics-01", "Tin học", "Tự chọn", "</>", 50, [
    q("i1", "Trong hệ nhị phân, số 1010 tương ứng hệ thập phân là", ["8", "10", "12", "14"], 1, "1010₂ = 1·8 + 0·4 + 1·2 + 0 = 10."),
    q("i2", "Giao thức dùng để truyền trang web an toàn là", ["FTP", "HTTP", "HTTPS", "SMTP"], 2, "HTTPS mã hóa kết nối HTTP bằng TLS."),
    q("i3", "Cấu trúc dữ liệu hoạt động theo nguyên tắc vào sau ra trước là", ["Hàng đợi", "Ngăn xếp", "Cây", "Đồ thị"], 1, "Ngăn xếp (stack) tuân theo LIFO: phần tử vào sau được lấy ra trước."),
    q("i4", "Trong Python, biểu thức len([2, 4, 6]) trả về", ["2", "3", "6", "12"], 1, "Danh sách có ba phần tử nên len trả về 3."),
    q("i5", "Mật khẩu nào mạnh hơn?", ["12345678", "password", "Vinh2008", "M7!qP2#zL9"], 3, "Mật khẩu dài, khó đoán và kết hợp nhiều loại kí tự có khả năng chống dò tốt hơn.")
  ]),

  exam("industrial-tech-01", "Công nghệ công nghiệp", "Tự chọn", "⚙", 50, [
    q("ti1", "Bản vẽ chi tiết dùng chủ yếu để", ["Lắp ráp sản phẩm", "Chế tạo và kiểm tra chi tiết", "Quảng cáo sản phẩm", "Tính tiền điện"], 1, "Bản vẽ chi tiết cung cấp hình dạng, kích thước và yêu cầu kĩ thuật để chế tạo, kiểm tra."),
    q("ti2", "Thiết bị bảo vệ mạch điện khi dòng điện quá lớn là", ["Cầu chì", "Công tắc", "Ổ cắm", "Bóng đèn"], 0, "Dây chảy của cầu chì nóng chảy để ngắt mạch khi dòng vượt mức an toàn."),
    q("ti3", "Vật liệu thường dùng làm dây dẫn điện là", ["Cao su", "Đồng", "Sứ", "Thủy tinh"], 1, "Đồng dẫn điện tốt, có độ dẻo và được dùng phổ biến làm lõi dây."),
    q("ti4", "Trong hệ thống điều khiển, cảm biến có nhiệm vụ", ["Thu nhận thông tin", "Tạo nhiên liệu", "Trang trí", "Tăng khối lượng"], 0, "Cảm biến biến đổi đại lượng cần đo thành tín hiệu cho bộ điều khiển."),
    q("ti5", "Nguồn năng lượng nào là tái tạo?", ["Than đá", "Dầu mỏ", "Mặt trời", "Khí tự nhiên"], 2, "Năng lượng mặt trời được bổ sung liên tục trong tự nhiên.")
  ]),

  exam("agricultural-tech-01", "Công nghệ nông nghiệp", "Tự chọn", "♧", 50, [
    q("ta1", "Luân canh cây trồng giúp chủ yếu", ["Tăng sâu bệnh", "Duy trì độ phì và hạn chế dịch hại", "Làm đất mặn hơn", "Loại bỏ tưới tiêu"], 1, "Thay đổi cây trồng giúp cân bằng dinh dưỡng và cắt vòng đời nhiều loài sâu bệnh."),
    q("ta2", "Độ pH đất quá thấp cho biết đất có tính", ["Kiềm mạnh", "Axit", "Trung tính", "Mặn tuyệt đối"], 1, "pH dưới 7 biểu thị môi trường axit; đất chua có pH thấp."),
    q("ta3", "Biện pháp sinh học trong bảo vệ cây trồng là", ["Dùng thiên địch", "Tăng liều thuốc tùy ý", "Đốt mọi tàn dư", "Ngừng theo dõi ruộng"], 0, "Sử dụng thiên địch là biện pháp sinh học giúp kiểm soát sinh vật gây hại."),
    q("ta4", "Mục đích chính của tiêm vaccine cho vật nuôi là", ["Tăng khối lượng ngay", "Tạo miễn dịch chủ động", "Thay thế thức ăn", "Giảm nhu cầu nước"], 1, "Vaccine kích thích cơ thể tạo đáp ứng miễn dịch chủ động với mầm bệnh."),
    q("ta5", "Nước tưới nhỏ giọt được đưa", ["Trực tiếp gần vùng rễ", "Lên toàn bộ tán cây với áp lực lớn", "Chỉ ra kênh thoát", "Vào kho chứa"], 0, "Tưới nhỏ giọt cấp nước chậm, gần rễ nên giảm thất thoát.")
  ]),

  exam("english-01", "Tiếng Anh", "Ngoại ngữ", "EN", 50, [
    q("en1", "Choose the correct form: She ___ to school every day.", ["go", "goes", "going", "gone"], 1, "The subject “she” takes the third-person singular verb “goes” in the present simple."),
    q("en2", "The word closest in meaning to “rapid” is", ["slow", "quick", "weak", "late"], 1, "“Rapid” means happening very quickly."),
    q("en3", "If I ___ enough time, I will help you.", ["have", "had", "will have", "having"], 0, "The first conditional uses present simple in the if-clause: If + present, will + verb."),
    q("en4", "Choose the correct passive sentence for “People speak English worldwide.”", ["English speaks worldwide.", "English is spoken worldwide.", "English was speaking worldwide.", "English has speak worldwide."], 1, "Present simple passive: am/is/are + past participle, so “is spoken”."),
    q("en5", "We are interested ___ science.", ["at", "on", "in", "for"], 2, "The fixed expression is “be interested in”."),
    q("en6", "Which word has a different stress pattern?", ["teacher", "student", "begin", "father"], 2, "“Begin” is stressed on the second syllable; the others on the first."),
    q("en7", "The opposite of “ancient” is", ["modern", "historic", "old", "former"], 0, "“Modern” is the usual antonym of “ancient”."),
    q("en8", "Neither Lan nor her friends ___ late.", ["is", "are", "was", "be"], 1, "With “neither...nor”, the verb agrees with the nearer subject “friends”, so “are”.")
  ]),

  exam("russian-01", "Tiếng Nga", "Ngoại ngữ", "RU", 50, [
    q("ru1", "Выберите приветствие утром.", ["Доброе утро", "Спокойной ночи", "До свидания", "Спасибо"], 0, "«Доброе утро» означает “chào buổi sáng”."),
    q("ru2", "Я ___ студент.", ["есть", "—", "быть", "былa"], 1, "Trong câu hiện tại xác định danh từ, động từ быть thường được lược bỏ: Я студент."),
    q("ru3", "Множественное число слова «книга» —", ["книгы", "книги", "книгу", "книгой"], 1, "Dạng số nhiều danh cách của «книга» là «книги»."),
    q("ru4", "«Спасибо» означает", ["xin chào", "cảm ơn", "xin lỗi", "tạm biệt"], 1, "«Спасибо» là lời cảm ơn."),
    q("ru5", "Он живёт ___ Москве.", ["на", "в", "к", "из"], 1, "Tên thành phố đi với giới từ «в»: в Москве.")
  ]),

  exam("french-01", "Tiếng Pháp", "Ngoại ngữ", "FR", 50, [
    q("fr1", "Complétez : Je ___ étudiant.", ["suis", "es", "est", "sommes"], 0, "Avec « je », le verbe être se conjugue « suis »."),
    q("fr2", "Le contraire de « grand » est", ["petit", "long", "beau", "jeune"], 0, "« Petit » est l'antonyme courant de « grand »."),
    q("fr3", "Nous ___ français.", ["parle", "parles", "parlons", "parlez"], 2, "Au présent, « parler » avec « nous » donne « parlons »."),
    q("fr4", "Quel article convient : ___ école?", ["le", "la", "l'", "les"], 2, "Devant une voyelle, on emploie l'article élidé « l' »."),
    q("fr5", "« Merci » signifie", ["cảm ơn", "xin chào", "tạm biệt", "xin lỗi"], 0, "« Merci » dùng để nói lời cảm ơn.")
  ]),

  exam("chinese-01", "Tiếng Trung Quốc", "Ngoại ngữ", "中", 50, [
    q("zh1", "“你好” có nghĩa là", ["Cảm ơn", "Xin chào", "Tạm biệt", "Xin lỗi"], 1, "你好 (nǐ hǎo) là lời chào thông dụng."),
    q("zh2", "Chữ nào có nghĩa là “người”?", ["人", "山", "水", "火"], 0, "人 (rén) nghĩa là người."),
    q("zh3", "“我___学生。” Điền từ phù hợp.", ["是", "有", "在", "去"], 0, "是 (shì) nối chủ ngữ với danh từ: Tôi là học sinh."),
    q("zh4", "“三” là số", ["1", "2", "3", "4"], 2, "三 (sān) nghĩa là ba."),
    q("zh5", "“谢谢” được dùng để", ["Chào buổi sáng", "Cảm ơn", "Hỏi tên", "Xin phép"], 1, "谢谢 (xièxie) nghĩa là cảm ơn.")
  ]),

  exam("german-01", "Tiếng Đức", "Ngoại ngữ", "DE", 50, [
    q("de1", "Ich ___ Schüler.", ["bin", "bist", "ist", "sind"], 0, "Das Verb «sein» lautet mit «ich»: ich bin."),
    q("de2", "„Guten Morgen“ sagt man", ["am Morgen", "am Abend", "in der Nacht", "zum Abschied"], 0, "„Guten Morgen“ ist die Begrüßung am Morgen."),
    q("de3", "Der Plural von „Buch“ ist", ["Buche", "Bücher", "Buchs", "Buchen"], 1, "Der korrekte Plural lautet „Bücher“."),
    q("de4", "Wir ___ Deutsch.", ["lerne", "lernst", "lernen", "lernt"], 2, "Mit „wir“ endet das Verb im Präsens auf -en: wir lernen."),
    q("de5", "„Danke“ nghĩa là", ["cảm ơn", "xin lỗi", "tạm biệt", "không"], 0, "„Danke“ là lời cảm ơn trong tiếng Đức.")
  ]),

  exam("japanese-01", "Tiếng Nhật", "Ngoại ngữ", "日", 50, [
    q("ja1", "「おはようございます」 dùng để chào vào", ["Buổi sáng", "Buổi trưa", "Buổi tối", "Lúc chia tay"], 0, "おはようございます là lời chào lịch sự vào buổi sáng."),
    q("ja2", "Trợ từ đánh dấu chủ đề trong câu thường là", ["を", "は", "へ", "で"], 1, "は (đọc là wa khi làm trợ từ) đánh dấu chủ đề."),
    q("ja3", "「水」 có nghĩa là", ["Lửa", "Nước", "Đất", "Gió"], 1, "水 (みず, mizu) nghĩa là nước."),
    q("ja4", "「ありがとう」 có nghĩa là", ["Xin chào", "Cảm ơn", "Xin lỗi", "Tạm biệt"], 1, "ありがとう là cách nói cảm ơn."),
    q("ja5", "Số 3 trong tiếng Nhật là", ["いち", "に", "さん", "よん"], 2, "さん (san) là số ba.")
  ]),

  exam("korean-01", "Tiếng Hàn", "Ngoại ngữ", "한", 50, [
    q("ko1", "“안녕하세요” có nghĩa là", ["Xin chào", "Cảm ơn", "Xin lỗi", "Tạm biệt"], 0, "안녕하세요 là lời chào lịch sự phổ biến."),
    q("ko2", "“물” có nghĩa là", ["Cơm", "Nước", "Nhà", "Sách"], 1, "물 (mul) nghĩa là nước."),
    q("ko3", "“감사합니다” được dùng để", ["Cảm ơn", "Hỏi đường", "Chào buổi sáng", "Giới thiệu tên"], 0, "감사합니다 là cách cảm ơn trang trọng."),
    q("ko4", "Chữ số Hàn thuần “하나” là", ["Một", "Hai", "Ba", "Bốn"], 0, "하나 (hana) là số một trong hệ số đếm thuần Hàn."),
    q("ko5", "Trong “저는 학생입니다”, “학생” nghĩa là", ["Giáo viên", "Học sinh", "Bác sĩ", "Bạn bè"], 1, "학생 (haksaeng) nghĩa là học sinh/sinh viên.")
  ])
];

const officialExamBySubject = new Map(OFFICIAL_PRACTICE_EXAMS_2026.map((item) => [item.subject, item]));

// Dùng đề người dùng cung cấp cho 17 môn; Ngữ văn tạm giữ đề luyện do chưa có tệp nguồn.
export const PRACTICE_EXAMS_2026 = ORIGINAL_PRACTICE_EXAMS_2026.map(
  (item) => officialExamBySubject.get(item.subject) || item
);

export const PRACTICE_CATEGORIES = ["Tất cả", "Bắt buộc", "Tự chọn", "Ngoại ngữ"];
