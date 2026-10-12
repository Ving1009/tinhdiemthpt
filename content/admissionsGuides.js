export const GUIDE_UPDATED = '2026-10-12';

const admissionRule = {
  title: 'Bộ GDĐT: Thông tư 06/2026/TT-BGDĐT về quy chế tuyển sinh',
  url: 'https://vanban.chinhphu.vn/?docid=217071&pageid=27160'
};
const graduationRule = {
  title: 'Bộ GDĐT: Văn bản hợp nhất 02/VBHN-BGDĐT ngày 17/04/2026 về quy chế thi tốt nghiệp THPT',
  url: 'https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-02-vbhn-bgddt-469408/64429.htm'
};
const academicRule = {
  title: 'Bộ GDĐT trả lời: Xét học bạ ba năm phải có Toán hoặc Ngữ văn',
  url: 'https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xet-hoc-ba-3-nam-phai-co-toan-hoac-ngu-van-87653.htm'
};
const cutoffNotice = {
  title: 'Đại học Cần Thơ: Thông báo điểm chuẩn và kết quả trúng tuyển chính thức năm 2026',
  url: 'https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/177-thong-tin/1163-thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026.html'
};
const combinationList = {
  title: 'Đại học Cần Thơ: Danh mục ngành, chỉ tiêu và tổ hợp xét tuyển năm 2026',
  url: 'https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/841-danh-muc-nganh-va-chi-tieu-tuyen-sinh-dhcq.html'
};
const methodList = {
  title: 'Đại học Cần Thơ: Các phương thức xét tuyển năm 2026',
  url: 'https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/943-phuong-thuc-xet-tuyen.html'
};

export const admissionsGuides = [
  {
    slug: 'tinh-diem-tot-nghiep-thpt',
    title: 'Cách tính điểm xét tốt nghiệp THPT và phân biệt với điểm vào đại học',
    description: 'Đọc công thức xét tốt nghiệp, kiểm tra điểm từng môn và hiểu vì sao kết quả thang 30 trên công cụ là điểm xét tuyển đại học.',
    category: 'Điểm và ưu tiên',
    updated: GUIDE_UPDATED,
    sources: [graduationRule, {
      title: 'Bộ GDĐT: Thông tư 24/2024/TT-BGDĐT, Điều 44 và Điều 45',
      url: 'https://vqa.moet.gov.vn/uploads/news/2024_12/final-quy-che-thi-tot-nghiep-thpt.pdf'
    }, {
      title: 'Bộ GDĐT: Thông tư 13/2026/TT-BGDĐT sửa đổi quy chế thi tốt nghiệp',
      url: 'https://vanban.chinhphu.vn/?docid=217189&pageid=27160&typegroupid=6'
    }],
    sections: [
      {
        id: 'hai-loai-diem',
        title: 'Bạn đang cần kiểm tra tốt nghiệp hay xét tuyển?',
        html: `<p>Điểm xét tốt nghiệp trả lời câu hỏi bạn có đáp ứng điều kiện công nhận tốt nghiệp THPT hay không. Điểm xét tuyển được trường đại học dùng để xét vào một chương trình cụ thể. Một bạn có thể đạt điểm xét tốt nghiệp khá cao nhưng tổng điểm tổ hợp muốn dùng để vào đại học lại thấp hơn dự kiến.</p><p>Phần <a href="/#calculator">Điểm thi THPT của bạn</a> trên website cộng các môn của tổ hợp và tính ưu tiên tuyển sinh, thường hiển thị thang 30. Bạn không dùng con số ấy làm điểm xét tốt nghiệp. Phần học bạ trên website cũng phục vụ mô phỏng xét tuyển; điểm trung bình ba môn ở đó khác với điểm trung bình tất cả môn có điểm số dùng trong xét tốt nghiệp.</p>`
      },
      {
        id: 'cong-thuc-tot-nghiep',
        title: 'Công thức để tự đối chiếu theo quy định năm 2026',
        html: `<p>Gọi H là điểm trung bình các năm học, T là điểm trung bình các môn dự thi để xét tốt nghiệp, KK là điểm khuyến khích và UT là điểm ưu tiên tốt nghiệp. Theo Điều 44 của <a href="https://congbao.chinhphu.vn/van-ban/van-ban-hop-nhat-so-02-vbhn-bgddt-469408/64429.htm">quy chế thi đã hợp nhất năm 2026</a>:</p><p><code>H = (ĐTB lớp 10 + 2 × ĐTB lớp 11 + 3 × ĐTB lớp 12) / 6</code></p><p><code>Điểm xét tốt nghiệp = (T + KK / 4 + H) / 2 + UT</code></p><p>Điểm trung bình năm và H được làm tròn đến hai chữ số thập phân; điểm xét tốt nghiệp lấy hai chữ số thập phân theo phần mềm. UT và KK ở công thức này thuộc quy chế thi tốt nghiệp. Không lấy mức KV1 hay UT1 của tuyển sinh đại học thay vào.</p>`
      },
      {
        id: 'vi-du-tot-nghiep',
        title: 'Ví dụ có đủ dữ liệu để kiểm tra lại',
        html: `<p>Ví dụ minh họa, một thí sinh thi bốn môn với điểm 6,00; 6,50; 7,00 và 7,50. T bằng 27 / 4 = 6,75. Điểm trung bình lớp 10, 11, 12 lần lượt là 6,80; 7,20; 7,60, nên H bằng 44 / 6, làm tròn thành 7,33. Giả sử không có ưu tiên hay khuyến khích, điểm xét tốt nghiệp là (6,75 + 7,33) / 2 = 7,04.</p><p>Khi tự tính, hãy ghi riêng các điểm đầu vào trước khi thay số. Nếu thuộc diện miễn thi, có kết quả bảo lưu hoặc chỉ có một số năm học theo chương trình Việt Nam, bạn cần kiểm tra điều khoản áp dụng với trường THPT; không tự gán điểm 10 cho một môn được miễn.</p>`
      },
      {
        id: 'kiem-tra-dieu-kien',
        title: 'Điểm trung bình đủ vẫn phải kiểm tra từng môn',
        html: `<p>Điều 45 quy định trường hợp thông thường phải đủ điều kiện dự thi, không bị hủy kết quả, từng môn thi đều trên 1,0 và điểm xét tốt nghiệp từ 5,0. Vì vậy, một môn đúng 1,0 vẫn là vấn đề dù phép tính trung bình cho kết quả trên 5,0. Các diện miễn thi toàn bộ hoặc đặc cách có quy định riêng.</p><p>Hãy đối chiếu với điểm và kết quả công nhận do cơ quan có thẩm quyền công bố. Khi đã xác định được tình trạng tốt nghiệp, bạn mới chuyển sang tính từng tổ hợp xét tuyển và đọc điều kiện vào ngành. Công thức trong bài dùng làm tài liệu tham chiếu năm 2026; khi chuẩn bị cho năm 2027, hãy kiểm tra văn bản của kỳ thi đó.</p>`
      }
    ],
    tool: { label: 'Mở công cụ điểm xét tuyển THPT', href: '/#calculator' },
    related: ['diem-xet-tuyen-va-uu-tien', 'xet-tuyen-hoc-ba']
  },
  {
    slug: 'diem-xet-tuyen-va-uu-tien',
    title: 'Điểm xét tuyển và cách tính ưu tiên khi tổng điểm từ 22,5',
    description: 'Cộng đúng ưu tiên khu vực và đối tượng, áp dụng mức giảm trên thang 30, rồi kiểm tra quy tắc riêng của trường.',
    category: 'Điểm và ưu tiên',
    updated: GUIDE_UPDATED,
    sources: [admissionRule, {
      title: 'Đại học FPT: Cách tính điểm ưu tiên xét tuyển đại học năm 2026',
      url: 'https://daihoc.fpt.edu.vn/tuyen-sinh/cach-tinh-diem-uu-tien-khi-xet-tuyen-dai-hoc/'
    }, {
      title: 'Bộ GDĐT trả lời: Xác định khu vực ưu tiên khi thay đổi địa giới hành chính',
      url: 'https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xac-dinh-khu-vuc-uu-tien-khi-thay-doi-dia-gioi-hanh-chinh-88858.htm'
    }],
    sections: [
      {
        id: 'muc-uu-tien',
        title: 'Xác định mức ưu tiên trước khi cộng điểm',
        html: `<p>Với tổ hợp ba môn không nhân hệ số, hãy ghi tổng điểm môn là S và mức ưu tiên gốc là P. Trên thang 30, mức khu vực năm 2026 là KV1: 0,75; KV2-NT: 0,50; KV2: 0,25; KV3: 0. Nhóm UT1 hưởng 2,00 và UT2 hưởng 1,00. P bằng ưu tiên khu vực cộng ưu tiên đối tượng đủ điều kiện. Bạn thuộc nhiều diện đối tượng thì dùng một mức cao nhất. Có thể đối chiếu tại <a href="https://daihoc.fpt.edu.vn/tuyen-sinh/cach-tinh-diem-uu-tien-khi-xet-tuyen-dai-hoc/">hướng dẫn năm 2026 của Đại học FPT</a>.</p><p>Ưu tiên khu vực theo quy chế 2026 áp dụng trong năm tốt nghiệp và một năm kế tiếp. Hãy kiểm tra mã trường THPT, thời gian học ở từng nơi và giấy tờ chứng minh đối tượng. Chỉ chọn nhóm ưu tiên khi có căn cứ; việc chọn một nhãn trên máy tính không xác nhận quyền hưởng ưu tiên của hồ sơ.</p>`
      },
      {
        id: 'giam-uu-tien',
        title: 'Mốc 22,5 được áp dụng với tổng điểm trước ưu tiên',
        html: `<p>Trên thang 30, S dưới 22,50 được cộng nguyên P. Từ 22,50, ưu tiên thực nhận được tính bằng <code>(30 − S) / 7,50 × P</code> và làm tròn đến hàng phần trăm. Tại đúng 22,50, hệ số vẫn bằng 1; tại 30, ưu tiên bằng 0. Quy tắc được nêu tại Điều 7 của <a href="https://vanban.chinhphu.vn/?docid=217071&amp;pageid=27160">Thông tư 06/2026/TT-BGDĐT</a>.</p><p>Ví dụ minh họa: ba môn 8,00; 8,00; 8,00 cho S = 24,00. Nếu bạn đủ điều kiện KV2-NT và UT2, P = 0,50 + 1,00 = 1,50. Ưu tiên thực nhận là 6 / 7,50 × 1,50 = 1,20; điểm sau ưu tiên là 25,20. Cộng nguyên 1,50 trong trường hợp này sẽ làm kết quả cao hơn 0,30.</p>`
      },
      {
        id: 'thang-diem-khac',
        title: 'Môn nhân hệ số và điểm cộng cần công thức của trường',
        html: `<p>Một tổng thang 40 không thể thay trực tiếp vào công thức có số 30. Quy chế yêu cầu quy đổi tương đương khi dùng thang điểm khác; cách lập điểm xét của từng phương thức phải đọc trong tài liệu trường. Chẳng hạn, 32/40 tương ứng 24/30 nếu trường áp dụng quy đổi tuyến tính, nhưng bạn cần kiểm tra trường có dùng cách đó hay không.</p><p>Công cụ học bạ có lựa chọn nhân hệ số 2 để xem tổng môn thang 40. Khi chưa có quy tắc ưu tiên đã xác minh, kết quả này cần được đối chiếu riêng. Với chứng chỉ hoặc thành tích được cộng điểm, hãy mở <a href="/#admission">công thức theo trường</a> để kiểm tra thứ tự quy đổi, cộng điểm và tính ưu tiên. Không thêm cùng một khoản lần thứ hai vào kết quả đã bao gồm khoản đó.</p>`
      },
      {
        id: 'doi-chieu-ho-so',
        title: 'Đối chiếu bốn dòng trên kết quả',
        html: `<ol><li>Kiểm tra đúng ba môn và đúng điểm gốc.</li><li>Kiểm tra khu vực, nhóm đối tượng và năm tốt nghiệp.</li><li>Đọc mức ưu tiên thực nhận sau điều chỉnh.</li><li>Kiểm tra thang điểm và những khoản đã được cộng.</li></ol><p>Khi địa giới hoặc mã trường THPT thay đổi, Bộ GDĐT hướng dẫn điền mã theo từng giai đoạn học tập đã được địa phương xác nhận trong <a href="https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xac-dinh-khu-vuc-uu-tien-khi-thay-doi-dia-gioi-hanh-chinh-88858.htm">giải đáp về khu vực ưu tiên</a>. Bạn nên hỏi đơn vị đăng ký nếu dữ liệu trên hệ thống khác giấy tờ, thay vì tự suy ra khu vực từ địa chỉ hiện tại.</p>`
      }
    ],
    tool: { label: 'Tính điểm tổ hợp và ưu tiên', href: '/#calculator' },
    related: ['tinh-diem-tot-nghiep-thpt', 'doc-diem-chuan-dai-hoc', 'loi-thuong-gap-khi-xet-tuyen']
  },
  {
    slug: 'xet-tuyen-hoc-ba',
    title: 'Xét tuyển học bạ: chọn đúng dữ liệu và kiểm tra công thức của trường',
    description: 'Phân biệt điểm cả năm với điểm học kỳ, nhận biết giới hạn của phép mô phỏng và đối chiếu yêu cầu học bạ năm 2026.',
    category: 'Học bạ',
    updated: GUIDE_UPDATED,
    sources: [academicRule, admissionRule, {
      title: 'Đại học Cần Thơ: Phương thức xét điểm học tập THPT năm 2026',
      url: 'https://tuyensinh.ctu.edu.vn/phuong-thuc-xet-tuyen/939-phuong-th-c-3.html'
    }],
    sections: [
      {
        id: 'chon-cot-diem',
        title: 'Đọc yêu cầu trước khi nhập bảng điểm',
        html: `<p>Trước khi tính, bạn cần biết trường dùng điểm nào, cho ngành nào và quy về thang nào. Cụm từ “xét học bạ” chưa đủ để chọn công thức. Điểm cả năm môn Toán lớp 12 và điểm trung bình cộng hai học kỳ của môn ấy có thể khác nhau; hãy nhập giá trị đúng nhãn ghi trong học bạ.</p><p>Trong <a href="https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xet-hoc-ba-3-nam-phai-co-toan-hoac-ngu-van-87653.htm">giải đáp của Bộ GDĐT về học bạ năm 2026</a>, cách xét thuần học bạ sử dụng điểm trung bình cả năm lớp 10, 11, 12 của ít nhất ba môn, quy về thang 30. Tổ hợp phải có Toán hoặc Ngữ văn, với trọng số của một trong hai môn tối thiểu một phần ba. Với cách xét kết hợp chứng chỉ hoặc trường hợp đổi môn học, hãy đọc điều kiện riêng trong quy chế và thông báo của trường.</p>`
      },
      {
        id: 'vi-du-hoc-ba',
        title: 'Ví dụ tính ba năm cho tổ hợp A01',
        html: `<p>Ví dụ minh họa cho công thức lấy trung bình ba điểm cả năm, không nhân hệ số: Toán có điểm 7,50; 8,00; 8,50, nên trung bình là 8,00. Vật lí có 7,00; 7,50; 8,00, trung bình 7,50. Tiếng Anh có 8,00; 8,50; 9,00, trung bình 8,50. Tổng A01 là 24,00 trước ưu tiên và các khoản cộng khác.</p><p>Bạn có thể ghi từng phép chia ra giấy để đối chiếu phần “Xem cách tính”. Ví dụ này minh họa thao tác tính, không khẳng định mọi trường đều lấy trung bình với trọng số bằng nhau. Nếu trường quy đổi điểm học bạ sang điểm thi, 24,00 vừa tính còn phải qua bảng quy đổi trước khi so với điểm chuẩn công bố.</p>`
      },
      {
        id: 'gioi-han-mo-phong',
        title: 'Các lựa chọn trên công cụ có phạm vi khác nhau',
        html: `<p><a href="/#academic">Công cụ học bạ</a> hiện có các lựa chọn ba năm, sáu học kỳ, cả năm lớp 12 và một số bộ học kỳ. Những lựa chọn chỉ lấy lớp 12, ba hoặc năm học kỳ, hoặc dừng ở học kỳ một lớp 12 là phép mô phỏng; không đáp ứng yêu cầu dữ liệu cả ba năm của cách xét thuần học bạ năm 2026 nêu trên.</p><p>Ngay cả khi chọn sáu học kỳ, tổng trung bình cộng sáu cột vẫn cần đối chiếu công thức lấy điểm cả năm của trường. Nếu hồ sơ yêu cầu ba điểm cả năm, bạn nên dùng lựa chọn ba năm và nhập đúng điểm đã ghi. Chưa có học kỳ hoặc năm học cuối thì có thể tính thử để lập kế hoạch, nhưng chưa coi đó là điểm nộp xét tuyển hoàn chỉnh.</p>`
      },
      {
        id: 'kiem-tra-anh-va-dieu-kien',
        title: 'Rà soát ảnh quét và điều kiện đầu vào',
        html: `<p>Sau khi quét ảnh, hãy kiểm tra từng ô với bản gốc: tên môn, năm học, dấu phẩy thập phân và điểm cả năm. Một điểm 8,1 bị đọc thành 8,7 có thể làm đổi thứ tự tổ hợp. Ô chưa đọc được phải bổ sung; đừng điền 0 thay cho dữ liệu còn thiếu.</p><p>Điều 6 của <a href="https://vanban.chinhphu.vn/?docid=217071&amp;pageid=27160">quy chế 2026</a> đặt mốc nguồn tuyển 15,00/30 từ ba môn thi tốt nghiệp theo tổ hợp, hoặc Toán, Ngữ văn và một môn khác, cho người thi tốt nghiệp từ năm 2026; có các ngoại lệ được nêu trong điều khoản. Học bạ cao chưa đủ để kết luận đủ điều kiện đăng ký. Hãy kiểm tra thêm ngưỡng đầu vào của ngành, yêu cầu môn, cách dùng chứng chỉ và giấy tờ của trường, rồi lưu công thức cùng đường dẫn đã dùng.</p>`
      }
    ],
    tool: { label: 'Nhập và tính bảng điểm học bạ', href: '/#academic' },
    related: ['diem-xet-tuyen-va-uu-tien', 'cac-phuong-thuc-xet-tuyen', 'loi-thuong-gap-khi-xet-tuyen']
  },
  {
    slug: 'doc-diem-chuan-dai-hoc',
    title: 'Cách đọc điểm chuẩn đại học để so sánh đúng ngành và thang điểm',
    description: 'Phân biệt điểm sàn với điểm chuẩn, kiểm tra mã chương trình và quy đổi phương thức trước khi dùng dữ liệu cũ để chọn ngành.',
    category: 'Tra cứu trường',
    updated: GUIDE_UPDATED,
    sources: [cutoffNotice, {
      title: 'Đại học Bách khoa Hà Nội: Thông cáo quy đổi điểm và độ lệch tổ hợp năm 2026',
      url: 'https://ts.hust.edu.vn/index.php/tin-tuc/thong-cao-bao-chi-ve-do-lech-giua-cac-to-hop-xet-tuyen-bang-quy-doi-diem-chuan-va-du-bao-muc-diem-trung-tuyen-vao-cac-nganh-cua-dai-hoc-bach-khoa-ha-noi-nam-2026'
    }],
    sections: [
      {
        id: 'diem-san-diem-chuan',
        title: 'Đọc tên thông báo trước khi đọc con số',
        html: `<p>Điểm sàn là ngưỡng để hồ sơ được tham gia xét tuyển theo điều kiện công bố. Điểm chuẩn là mức trúng tuyển được xác định sau quá trình xét tuyển. Một thông báo “nhận hồ sơ từ 18 điểm” chưa cho biết ngành sẽ lấy 18 điểm. Bạn cần tìm đúng thông báo kết quả của đúng đợt tuyển sinh.</p><p>Với mỗi dòng, ghi năm, tên trường, mã xét tuyển, tên chương trình, phương thức, thang điểm và điều kiện kèm theo. Hai chương trình cùng tên ngành có thể khác ngôn ngữ giảng dạy, cơ sở học hoặc học phí. Bảng chỉ có tên ngành và một con số nên được mở lại ở nguồn gốc để đọc các cột và chú thích còn thiếu.</p>`
      },
      {
        id: 'cung-thang-cung-phuong-thuc',
        title: 'So sánh điểm sau đúng phép quy đổi',
        html: `<p>Điểm học bạ 26/30, điểm thi THPT 26/30 và một kết quả đánh giá năng lực đều cần được đọc trong phương thức cụ thể. Cùng mẫu số không có nghĩa là cùng cách xét. Ví dụ thực tế, <a href="https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/177-thong-tin/1163-thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026.html">Đại học Cần Thơ công bố năm 2026</a> một mức điểm chuẩn theo mã ngành áp dụng cho THPT, học bạ và V-SAT sau khi quy đổi theo quy định của trường.</p><p>Ví dụ minh họa: bạn có tổng học bạ 26,00, một ngành công bố chuẩn 24,00 sau quy đổi. Chưa thể lấy 26,00 trừ 24,00 để nói mình cao hơn hai điểm. Bạn phải tính điểm học bạ quy đổi, ưu tiên và các khoản cộng đúng quy tắc rồi mới so sánh.</p>`
      },
      {
        id: 'doc-chu-thich',
        title: 'Đọc chú thích khi điểm sát mức chuẩn',
        html: `<p>Hãy xác định điểm trên bảng đã gồm ưu tiên chưa, có môn nhân hệ số hay không, có điều kiện môn thành phần hoặc hồ sơ bổ sung nào. Đối chiếu điểm cuối cùng đã làm tròn theo trường. Nếu bạn đứng sát mốc, kiểm tra quy tắc xử lý những hồ sơ bằng điểm ở cuối danh sách trong quy chế tuyển sinh của năm đó.</p><p>Độ lệch giữa tổ hợp cũng phải lấy từ thông báo cụ thể. <a href="https://ts.hust.edu.vn/index.php/tin-tuc/thong-cao-bao-chi-ve-do-lech-giua-cac-to-hop-xet-tuyen-bang-quy-doi-diem-chuan-va-du-bao-muc-diem-trung-tuyen-vao-cac-nganh-cua-dai-hoc-bach-khoa-ha-noi-nam-2026">Đại học Bách khoa Hà Nội có thông cáo riêng năm 2026</a> về độ lệch tổ hợp và điểm tương đương giữa các phương thức. Bạn không mang bảng ấy sang một trường khác chỉ vì hai trường cùng nhận điểm của một kỳ thi.</p>`
      },
      {
        id: 'dung-du-lieu-cu',
        title: 'Dùng dữ liệu 2026 để lập danh sách cho năm 2027',
        html: `<p>Trong <a href="/#universities">hồ sơ trường</a> và phần tìm ngành, điểm chuẩn 2026 là mốc tham khảo cho người chuẩn bị tuyển sinh 2027. Ghi khoảng chênh giữa điểm dự kiến của bạn và mốc ấy, kèm những yếu tố còn chờ cập nhật: tổ hợp, phương thức, công thức và chỉ tiêu. Số chênh này giúp bạn chọn nơi cần tìm hiểu thêm; nó không phải xác suất trúng tuyển.</p><p>Bạn nên giữ vài phương án ở các mức điểm khác nhau và kiểm tra chương trình học, chi phí, địa điểm trước khi đưa vào nguyện vọng. Khi trường công bố thông tin 2027, thay dữ liệu tham chiếu bằng thông báo mới. Nếu website và trường có số khác nhau, ưu tiên kiểm tra thông báo chính thức cùng năm, cùng mã và cùng đợt.</p>`
      }
    ],
    tool: { label: 'Tra cứu hồ sơ và điểm chuẩn 2026', href: '/#universities' },
    related: ['chon-to-hop-xet-tuyen', 'sap-xep-nguyen-vong', 'diem-xet-tuyen-va-uu-tien']
  },
  {
    slug: 'chon-to-hop-xet-tuyen',
    title: 'Chọn tổ hợp xét tuyển từ điểm mạnh và yêu cầu của ngành',
    description: 'Tra đúng môn theo mã tổ hợp, tính thử điểm của mình và kiểm tra ngành có nhận tổ hợp đó trong năm đăng ký hay không.',
    category: 'Chọn ngành',
    updated: GUIDE_UPDATED,
    sources: [combinationList, admissionRule],
    sections: [
      {
        id: 'ma-va-mon',
        title: 'Mã tổ hợp giúp bạn xác định đúng các môn',
        html: `<p>A00 gồm Toán, Vật lí, Hóa học; A01 gồm Toán, Vật lí, Tiếng Anh; D01 gồm Toán, Ngữ văn, Tiếng Anh; B00 gồm Toán, Hóa học, Sinh học. Các mã này được thể hiện trong <a href="https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/841-danh-muc-nganh-va-chi-tieu-tuyen-sinh-dhcq.html">danh mục tuyển sinh năm 2026 của Đại học Cần Thơ</a>. Với một mã ít gặp, hãy mở bảng tổ hợp để đọc đủ tên môn.</p><p>Bạn nên phân biệt ngoại ngữ cụ thể, môn giáo dục kinh tế và pháp luật, Tin học và các môn Công nghệ. Một nhãn viết tắt giống nhau ở bảng cũ có thể khiến bạn nhập nhầm môn. Phần <a href="/#combinations">tra cứu tổ hợp</a> giúp tìm theo mã hoặc tên môn; sau đó vẫn cần đối chiếu danh mục ngành của trường.</p>`
      },
      {
        id: 'vi-du-so-sanh-to-hop',
        title: 'Tính thử những tổ hợp bạn có đủ điểm',
        html: `<p>Ví dụ minh họa: bạn có Toán 8,20, Vật lí 7,80, Hóa học 6,80, Ngữ văn 7,00 và Tiếng Anh 8,50. Tổng chưa ưu tiên của A00 là 22,80; A01 là 24,50; D01 là 23,70. A01 cao nhất trong ba phép cộng này. Bạn tiếp tục kiểm tra ngành mong muốn có nhận A01 và có điều chỉnh điểm giữa tổ hợp hay không.</p><p>Đừng chọn một mã chỉ vì tổng hiện tại cao nếu phương thức cần môn bạn không có kết quả hợp lệ. Khi chuẩn bị trước kỳ thi, hãy thử với một khoảng điểm thực tế thay vì chỉ lấy lần thi thử tốt nhất. Chẳng hạn, giảm Tiếng Anh 0,50 điểm để xem danh sách ngành thay đổi thế nào; điều đó giúp bạn nhận ra phương án đang phụ thuộc quá nhiều vào một môn.</p>`
      },
      {
        id: 'tu-to-hop-den-nganh',
        title: 'Đối chiếu từ ngành sang tổ hợp trường chấp nhận',
        html: `<p>Tìm mã xét tuyển và tên chương trình trước, rồi đọc tổ hợp nằm cùng dòng. Không suy ra rằng mọi ngành kỹ thuật nhận A00 hay mọi ngành kinh tế nhận D01. Một trường có nhiều cơ sở hoặc chương trình cùng tên ngành có thể công bố các danh mục khác nhau. Lưu đường dẫn và năm của bảng bạn đã kiểm tra.</p><p>Nếu ngành có thi năng khiếu, bạn cần xem môn năng khiếu nào, đơn vị tổ chức và trường có nhận kết quả nơi khác không. Với chứng chỉ ngoại ngữ, hãy đọc bảng quy đổi được trường công bố. Điểm ngoại ngữ tự nhập để thử không thay thế việc đáp ứng điều kiện chứng chỉ và gửi minh chứng.</p>`
      },
      {
        id: 'chon-mon-va-lap-ke-hoach',
        title: 'Giữ các lựa chọn phù hợp khi lên kế hoạch học',
        html: `<p>Bạn có thể lập một bảng ngắn: ngành muốn học, trường, tổ hợp được nhận, môn đang học, môn sẽ thi và dữ liệu còn thiếu. Nếu một tổ hợp đòi hai môn bạn không học hoặc chưa định thi, ghi rõ để tìm phương án khác hoặc hỏi trường về điều kiện thay thế. Việc này nên làm trước khi quyết định kế hoạch ôn.</p><p>Danh mục 2026 trên website giúp khảo sát ban đầu cho năm 2027. Bạn cần kiểm tra danh mục mới khi trường công bố, nhất là tổ hợp có môn mới hoặc năng khiếu. Sau khi chốt tổ hợp phù hợp, dùng <a href="/#major-finder">tìm ngành theo điểm</a> để tạo danh sách tham khảo, rồi đọc chương trình học và điều kiện dự tuyển của từng lựa chọn.</p>`
      }
    ],
    tool: { label: 'Tra mã tổ hợp và các môn', href: '/#combinations' },
    related: ['doc-diem-chuan-dai-hoc', 'sap-xep-nguyen-vong', 'cac-phuong-thuc-xet-tuyen']
  },
  {
    slug: 'sap-xep-nguyen-vong',
    title: 'Sắp xếp nguyện vọng theo thứ tự bạn muốn học',
    description: 'Hiểu cách giữ nguyện vọng đủ điều kiện cao nhất, lập danh sách theo mức yêu thích và rà soát mã trước khi đăng ký chính thức.',
    category: 'Nguyện vọng',
    updated: GUIDE_UPDATED,
    sources: [admissionRule, {
      title: 'Bộ GDĐT trả lời: Số nguyện vọng được đăng ký trong tuyển sinh 2026',
      url: 'https://baochinhphu.vn/tuyen-sinh-2026-thi-sinh-duoc-dang-ky-toi-da-bao-nhieu-nguyen-vong-102260410094048907.htm'
    }, {
      title: 'Đại học Cần Thơ: Hướng dẫn đăng ký nguyện vọng trên cổng tuyển sinh năm 2026',
      url: 'https://tuyensinh.ctu.edu.vn/images/upload/TT_TS/2026/HD-Cong-tuyen-sinh.pdf'
    }],
    sections: [
      {
        id: 'nguyen-vong-cao-nhat',
        title: 'Nguyện vọng số 1 thể hiện lựa chọn ưu tiên cao nhất',
        html: `<p>Khi nhiều nguyện vọng đủ điều kiện trúng tuyển, hệ thống chỉ giữ nguyện vọng có thứ tự cao nhất. Vì thế, bạn nên xếp ngành muốn học hơn lên trước. Nếu đặt một phương án ít thích ở vị trí cao chỉ vì thấy dễ trúng tuyển, bạn có thể được giữ ở phương án ấy dù cũng đủ điều kiện vào ngành thích hơn ở dưới.</p><p><a href="https://baochinhphu.vn/tuyen-sinh-2026-thi-sinh-duoc-dang-ky-toi-da-bao-nhieu-nguyen-vong-102260410094048907.htm">Bộ GDĐT giải đáp quy định năm 2026</a>: tối đa 15 nguyện vọng; chương trình đào tạo giáo viên chỉ xét nguyện vọng thứ 1 đến 5. Đây là giới hạn của quy chế 2026 để tham chiếu. Bạn cần xem hướng dẫn của năm đăng ký khi lập danh sách chính thức cho năm 2027.</p>`
      },
      {
        id: 'vi-du-thu-tu',
        title: 'Ví dụ để kiểm tra danh sách có đúng ý muốn',
        html: `<p>Ví dụ minh họa: bạn thích chương trình A nhất, sau đó B, rồi C. Bạn xếp A ở vị trí 1, B ở vị trí 2, C ở vị trí 3. Nếu chỉ B và C đủ điều kiện, hệ thống giữ B. Nếu cả A, B và C đủ điều kiện, hệ thống giữ A. Nếu bạn đảo C lên đầu, C có thể là kết quả được giữ khi đủ điều kiện.</p><p>Hãy thử câu hỏi: “Nếu đủ điều kiện vào cả hai, mình chọn ngành nào?”. So từng cặp có thể giúp giải quyết những lựa chọn còn ngang nhau. Bạn cần tính đến môn học, nơi học, học phí và điều kiện sinh hoạt. Một chương trình bạn sẽ từ chối nhập học khi trúng tuyển nên được xem lại trước khi đưa vào danh sách.</p>`
      },
      {
        id: 'thu-tu-va-hoa-diem',
        title: 'Đọc riêng quy tắc xử lý hồ sơ bằng điểm',
        html: `<p>Nguyên tắc thông thường là xét bình đẳng theo điểm và mức điểm tương đương. Tuy nhiên, Điều 15 của <a href="https://vanban.chinhphu.vn/?docid=217071&amp;pageid=27160">quy chế năm 2026</a> có quy tắc ở cuối danh sách: khi bằng điểm xét, ưu tiên hồ sơ có điểm cộng thấp hơn; nếu điểm cộng cũng bằng nhau, xét thứ tự nguyện vọng cao hơn. Vì vậy, cần đọc đầy đủ điều kiện thay vì khẳng định vị trí nguyện vọng hoàn toàn không ảnh hưởng.</p><p>Quy tắc này không giúp một hồ sơ thiếu điều kiện hay thiếu điểm trở thành đủ điều kiện. Khi lập danh sách, bạn vẫn cần tính điểm theo phương thức của trường và kiểm tra ngưỡng đầu vào, tổ hợp, minh chứng.</p>`
      },
      {
        id: 'ra-soat-truoc-dang-ky',
        title: 'Chuyển danh sách tham khảo sang hồ sơ chính thức',
        html: `<ol><li>Ghi đúng mã trường, mã xét tuyển và tên chương trình.</li><li>Kiểm tra điều kiện của từng dòng, kể cả năng khiếu hoặc sơ tuyển.</li><li>Sắp xếp theo mức muốn học; giữ các phương án phù hợp ở những mức điểm khác nhau.</li><li>Đối chiếu danh sách trên cổng chính thức sau khi lưu và hoàn thành lệ phí theo hướng dẫn.</li></ol><p>Danh sách lưu trên website này là tài liệu để bạn chuẩn bị. Hãy đăng nhập hệ thống tuyển sinh chính thức để đăng ký, rồi kiểm tra trạng thái và thứ tự đã lưu. Sau kết quả, việc xác nhận nhập học và thủ tục tại trường còn cần thực hiện theo thông báo; lưu danh sách nguyện vọng không hoàn thành những bước đó.</p>`
      }
    ],
    tool: { label: 'Tìm ngành và chuẩn bị danh sách nguyện vọng', href: '/#major-finder' },
    related: ['doc-diem-chuan-dai-hoc', 'chon-to-hop-xet-tuyen', 'loi-thuong-gap-khi-xet-tuyen']
  },
  {
    slug: 'cac-phuong-thuc-xet-tuyen',
    title: 'Các phương thức xét tuyển: chọn kết quả nào và kiểm tra điều kiện gì?',
    description: 'Lập bảng điều kiện cho điểm thi THPT, học bạ, đánh giá năng lực, đánh giá tư duy và phương thức kết hợp của từng trường.',
    category: 'Phương thức',
    updated: GUIDE_UPDATED,
    sources: [methodList, {
      title: 'Đại học Bách khoa Hà Nội: Thông tin tuyển sinh đại học và các phương thức năm 2026',
      url: 'https://ts.hust.edu.vn/index.php/p/dai-hoc'
    }, admissionRule],
    sections: [
      {
        id: 'nguon-diem',
        title: 'Tên phương thức cho biết loại kết quả được dùng',
        html: `<p>Phương thức xét tuyển xác định kết quả nào được trường tiếp nhận và cách dùng kết quả ấy. Điểm thi THPT thường đi theo tổ hợp môn. Học bạ dùng kết quả học tập đã ghi trong hồ sơ. Đánh giá năng lực, đánh giá tư duy hay V-SAT có kỳ thi và thang điểm riêng. Tuyển thẳng, phương thức kết hợp chứng chỉ hoặc thành tích cần đọc thêm đối tượng, điều kiện và minh chứng.</p><p>Các trường có danh mục khác nhau. Năm 2026, <a href="https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/943-phuong-thuc-xet-tuyen.html">Đại học Cần Thơ công bố</a> xét THPT, học bạ, V-SAT cùng những phương thức khác; <a href="https://ts.hust.edu.vn/index.php/p/dai-hoc">Đại học Bách khoa Hà Nội</a> có xét tuyển tài năng, đánh giá tư duy và điểm THPT. Bạn nên mở danh mục của chính trường muốn đăng ký.</p>`
      },
      {
        id: 'bang-dieu-kien',
        title: 'Lập bảng nhỏ cho từng ngành muốn học',
        html: `<p>Với mỗi phương thức, ghi loại kết quả bạn có, năm thi, tổ hợp hoặc phần thi cần dùng, ngưỡng tiếp nhận, cách quy đổi và giấy tờ phải bổ sung. Để trống ô chưa biết rồi tìm trong thông báo chính thức. Cách này giúp phát hiện sớm hồ sơ có điểm cao nhưng thiếu một điều kiện bắt buộc.</p><p>Ví dụ minh họa: bạn có điểm THPT và một kết quả đánh giá năng lực. Trường A nhận cả hai cho ngành mong muốn, trường B chỉ nhận THPT và một kỳ thi khác. Kết quả đánh giá năng lực của bạn không tự dùng được ở B. Tương tự, một chứng chỉ đạt điểm yêu cầu vẫn cần đúng loại, thời hạn và cách nộp do trường quy định.</p>`
      },
      {
        id: 'diem-goc-va-quy-doi',
        title: 'Giữ riêng điểm gốc và điểm dùng để xét',
        html: `<p>Công cụ có thể hiển thị điểm gốc của kỳ thi theo thang 100, 150 hoặc 1200. Muốn so với một mức điểm chuẩn thang 30, bạn phải có quy tắc quy đổi của trường và năm tương ứng. Không lấy tỷ lệ điểm đạt trên điểm tối đa rồi nhân 30 để thay cho bảng quy đổi theo phân vị.</p><p>Trong <a href="/#admission">công thức theo trường</a>, hãy xem phương thức, ngành áp dụng và tài liệu kiểm chứng trước khi nhập điểm. Nếu công thức đang thiếu dữ liệu hoặc chưa hỗ trợ tự tính, mở nguồn trường để tính hoặc hỏi bộ phận tuyển sinh. Một tổng tự tính theo công thức chung chưa thể đại diện cho phương thức kết hợp có trọng số riêng.</p>`
      },
      {
        id: 'chon-va-hoan-thanh',
        title: 'Chọn phương thức phù hợp với hồ sơ bạn có',
        html: `<p>Ưu tiên kiểm tra những phương thức bạn đã có kết quả hợp lệ, sau đó cân nhắc kỳ thi hoặc chứng chỉ bổ sung theo ngành muốn học. Trước khi dành thời gian ôn một kỳ thi, xác nhận trường có nhận kết quả, ngành có áp dụng và bạn đáp ứng các điều kiện còn lại.</p><p>Nếu dùng nhiều kết quả, ghi riêng điểm xét đã tính theo từng phương thức. Thông báo đủ điều kiện ở một phương thức còn cần được xử lý trong quy trình tuyển sinh chung. Bạn phải hoàn thành khai dữ liệu, minh chứng và đăng ký nguyện vọng theo hướng dẫn năm đó. Các nguồn trong bài là năm 2026; danh mục và công thức cho tuyển sinh 2027 cần được kiểm tra lại khi trường công bố.</p>`
      }
    ],
    tool: { label: 'Xem phương thức và công thức theo trường', href: '/#admission' },
    related: ['xet-tuyen-hoc-ba', 'doc-diem-chuan-dai-hoc', 'sap-xep-nguyen-vong']
  },
  {
    slug: 'loi-thuong-gap-khi-xet-tuyen',
    title: 'Những lỗi thường gặp khi tính điểm và chuẩn bị hồ sơ xét tuyển',
    description: 'Rà soát nhầm năm, nhầm thang, cộng ưu tiên hai lần, dữ liệu học bạ bị đọc sai và nguyện vọng chưa đăng ký trên hệ thống chính thức.',
    category: 'Hồ sơ',
    updated: GUIDE_UPDATED,
    sources: [academicRule, cutoffNotice, {
      title: 'Bộ GDĐT: Hướng dẫn thí sinh trong công tác tuyển sinh đại học năm 2026',
      url: 'https://xaydungchinhsach.chinhphu.vn/tuyen-sinh-dai-hoc-cao-dang-2026-nhung-luu-y-voi-thi-sinh-119260505060425039.htm'
    }],
    sections: [
      {
        id: 'nham-diem-va-nam',
        title: 'Nhầm năm dữ liệu hoặc loại điểm',
        html: `<p>Bạn có thể nhìn thấy điểm 24,50 ở một hồ sơ trường rồi so ngay với tổng ba môn của mình. Trước khi so, hãy kiểm tra năm, mã chương trình, đợt tuyển sinh, phương thức và thang điểm. Điểm chuẩn 2026 trên website là mốc tham khảo khi chuẩn bị cho năm 2027; nó chưa cho biết mức trúng tuyển của năm sau.</p><p>Ví dụ minh họa: bạn tính tổng học bạ 25,00 và thấy điểm chuẩn 24,00. Nếu bảng chuẩn áp dụng sau quy đổi, cần quy đổi 25,00 theo trường trước. Mở thông báo gốc như <a href="https://tuyensinh.ctu.edu.vn/chuong-trinh-dai-tra/177-thong-tin/1163-thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026.html">thông báo năm 2026 của Đại học Cần Thơ</a> để đọc phạm vi áp dụng thay vì chỉ nhìn con số trên bảng tổng hợp.</p>`
      },
      {
        id: 'nham-uu-tien-he-so',
        title: 'Cộng lại ưu tiên hoặc dùng sai thang điểm',
        html: `<p>Sau khi công cụ đã tính ưu tiên, cộng thêm mức KV và UT bằng tay sẽ làm khoản này xuất hiện hai lần. Hãy đọc bảng chi tiết: tổng môn, mức ưu tiên gốc, mức thực nhận và điểm cuối cùng. Nếu tự đối chiếu, bắt đầu từ điểm môn gốc để tránh lẫn các bước.</p><p>Với một môn nhân hệ số, ghi rõ tổng đang là thang 40 hay đã quy về 30. Tránh dùng trực tiếp tổng 40 trong công thức ưu tiên trên thang 30. Nếu hai công cụ cho kết quả khác nhau, so đầu vào và thứ tự quy đổi trước; một công cụ có thể đang áp dụng công thức riêng của trường, còn công cụ kia chỉ cộng ba môn thông thường.</p>`
      },
      {
        id: 'nham-du-lieu-hoc-ba',
        title: 'Sai một ô học bạ có thể làm đổi kết quả',
        html: `<p>Ảnh mờ, bóng sáng hoặc bảng nghiêng có thể khiến điểm, môn và cột năm học bị nhận diện nhầm. Kiểm tra bảng đã nhận với ảnh gốc theo từng hàng. Chú ý các cặp 6 và 8, 1 và 7, dấu thập phân và tên môn ngoại ngữ. Giữ ô thiếu là thiếu dữ liệu cho đến khi đọc được bản gốc.</p><p>Chọn sai bộ học kỳ cũng tạo ra kết quả hợp lệ về phép cộng nhưng sai phạm vi hồ sơ. <a href="https://chinhsachonline.chinhphu.vn/tuyen-sinh-2026-xet-hoc-ba-3-nam-phai-co-toan-hoac-ngu-van-87653.htm">Hướng dẫn học bạ năm 2026 của Bộ GDĐT</a> dùng điểm cả năm của ba lớp. Sau quét, hãy kiểm tra cả phương thức đã chọn, thay vì chỉ kiểm tra từng số.</p>`
      },
      {
        id: 'thieu-buoc-ho-so',
        title: 'Danh sách đã lưu chưa phải hồ sơ đã đăng ký',
        html: `<p>Danh sách nguyện vọng hoặc kết quả tính được lưu trên website này giúp bạn chuẩn bị. Bạn vẫn cần đăng ký trên hệ thống tuyển sinh chính thức, kiểm tra dữ liệu và hoàn thành các bước theo hướng dẫn. <a href="https://xaydungchinhsach.chinhphu.vn/tuyen-sinh-dai-hoc-cao-dang-2026-nhung-luu-y-voi-thi-sinh-119260505060425039.htm">Hướng dẫn của Bộ GDĐT năm 2026</a> yêu cầu thí sinh rà soát học bạ trên hệ thống và báo đơn vị có trách nhiệm khi có sai sót.</p><p>Trước khi kết thúc, xem lại mã trường, mã xét tuyển, thứ tự, trạng thái lưu và lệ phí. Sau khi có kết quả, kiểm tra thông báo xác nhận nhập học và thủ tục tại trường. Lấy mốc thời gian từ thông báo của đúng năm; đừng dùng hạn của hồ sơ 2026 cho kỳ đăng ký 2027.</p>`
      },
      {
        id: 'bao-sai-co-can-cu',
        title: 'Báo lỗi bằng thông tin có thể kiểm tra',
        html: `<p>Nếu phát hiện thông tin sai trên website, bạn có thể gửi đến hotro.tinhdiemthpt@gmail.com: đường dẫn trang, tên trường hoặc công cụ, năm dữ liệu, giá trị đang hiển thị và nguồn chính thức cần đối chiếu. Với lỗi tính, nêu bộ điểm mẫu và phương thức đã chọn để có thể tính lại. Tránh gửi căn cước hoặc cả hồ sơ cá nhân khi chỉ cần giải thích một phép tính.</p>`
      }
    ],
    tool: { label: 'Xem hướng dẫn đọc kết quả công cụ', href: '/#guide' },
    related: ['diem-xet-tuyen-va-uu-tien', 'xet-tuyen-hoc-ba', 'sap-xep-nguyen-vong']
  }
];
