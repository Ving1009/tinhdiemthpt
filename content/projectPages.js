export const projectPages = [
  {
    slug: 'gioi-thieu',
    title: 'Giới thiệu Tính Điểm THPT',
    description: 'Tính Điểm THPT hỗ trợ tính điểm, tra cứu trường và ngành, chuẩn bị nguyện vọng và luyện tập. Tìm hiểu phạm vi dữ liệu và cách sử dụng kết quả.',
    updated: '2026-10-12',
    sections: [
      {
        id: 'muc-dich',
        title: 'Website giúp bạn làm gì?',
        html: `<p>Tính Điểm THPT giúp bạn kiểm tra điểm xét tuyển và tìm thông tin về trường, ngành trước khi lập kế hoạch đăng ký. Bạn có thể bắt đầu từ điểm thi, bảng điểm học bạ hoặc một ngành đang quan tâm, rồi lưu các lựa chọn để so sánh.</p>
<p>Website hướng tới thí sinh chuẩn bị cho năm 2027. Hồ sơ trường, điểm chuẩn và công thức năm 2026 được giữ làm dữ liệu tham khảo trong lúc thông tin 2027 đang cập nhật. Một mức điểm của năm trước giúp bạn có thêm căn cứ tìm hiểu, nhưng không xác định kết quả xét tuyển năm sau.</p>`
      },
      {
        id: 'cong-cu',
        title: 'Chọn công cụ theo việc cần làm',
        html: `<ul>
<li><a href="/#calculator">Tính điểm THPT</a>: nhập điểm và thông tin ưu tiên, xem các tổ hợp phù hợp rồi mở “Xem cách tính” để kiểm tra từng phần.</li>
<li><a href="/#academic">Tính học bạ</a>: nhập điểm theo phương thức đã chọn hoặc dùng ảnh để hỗ trợ nhập. Sau khi quét, bạn cần kiểm tra bảng điểm trước khi xác nhận.</li>
<li><a href="/#admission">Công thức theo trường</a>: xem phương thức, phạm vi áp dụng và trạng thái xác minh của công thức. Mục chưa đủ căn cứ có thể chỉ hiển thị để tham khảo.</li>
<li><a href="/#universities">Hồ sơ trường</a> và <a href="/#major-finder">tìm ngành</a>: đối chiếu mã ngành, tổ hợp, phương thức và thang điểm, lưu lựa chọn hoặc so sánh các phương án.</li>
<li><a href="/#practice-exams">Phòng thi thử</a>: làm bài có đếm giờ, xem điểm và lời giải ở những câu có dữ liệu. Điểm luyện tập dùng để xem lại bài làm của bạn.</li>
</ul>`
      },
      {
        id: 'doc-ket-qua',
        title: 'Đọc kết quả cùng điều kiện áp dụng',
        html: `<p>Khi so sánh điểm, hãy kiểm tra cả năm tuyển sinh, phương thức và thang điểm. Điểm thi THPT, học bạ và các kỳ thi đánh giá năng lực có thể dùng những quy tắc khác nhau. Một con số giống nhau chưa đủ để kết luận hai kết quả có thể đối chiếu trực tiếp.</p>
<p>Danh sách nguyện vọng và file PDF tải từ website là bản chuẩn bị cá nhân. Bạn vẫn cần đăng ký theo hướng dẫn của hệ thống tuyển sinh và của trường. Thông báo chính thức của cơ sở đào tạo là nơi cần kiểm tra về điều kiện, thời hạn và cách nộp hồ sơ.</p>`
      },
      {
        id: 'van-hanh',
        title: 'Đầu mối vận hành và góp ý',
        html: `<p>Nhóm vận hành Tính Điểm THPT tiếp nhận câu hỏi về website qua <a href="mailto:hotro.tinhdiemthpt@gmail.com">hotro.tinhdiemthpt@gmail.com</a>. Nếu thấy thông tin về trường hoặc ngành cần sửa, bạn có thể dùng “Báo dữ liệu sai” trong hồ sơ trường hoặc “Báo sai” cạnh dòng ngành để gửi đúng mục cần kiểm tra.</p>
<p><a href="/nguon-du-lieu-va-bao-sai/">Nguồn dữ liệu và cách báo sai</a> giải thích các trạng thái đang dùng và những thông tin nên kèm theo báo cáo. Với lỗi thao tác, xem <a href="/lien-he/">cách liên hệ hỗ trợ</a> để mô tả lỗi bằng một ví dụ có thể kiểm tra lại.</p>`
      },
      {
        id: 'du-lieu-ca-nhan',
        title: 'Sử dụng công cụ và quản lý dữ liệu',
        html: `<p>Bạn có thể dùng các công cụ mà không tạo tài khoản. Tài khoản hỗ trợ lưu bản sao dữ liệu công cụ để khôi phục giữa các thiết bị. Nếu dùng máy chung, hãy đăng xuất sau khi hoàn tất; đăng xuất không xóa tài khoản hoặc bản sao đã lưu trên hệ thống.</p>
<p>Trước khi gửi ảnh học bạ hoặc yêu cầu trợ lý trả lời, đọc <a href="/privacy">chính sách quyền riêng tư</a> để biết dữ liệu nào được xử lý. <a href="/dieu-khoan-su-dung/">Điều khoản sử dụng</a> nêu cách dùng kết quả, gửi góp ý và tôn trọng quyền đối với nội dung của website.</p>`
      }
    ]
  },
  {
    slug: 'lien-he',
    title: 'Liên hệ và hỗ trợ',
    description: 'Liên hệ Nhóm vận hành Tính Điểm THPT để báo lỗi công cụ, góp ý dữ liệu, gửi yêu cầu về tài khoản, quyền riêng tư hoặc nội dung.',
    updated: '2026-10-12',
    sections: [
      {
        id: 'email',
        title: 'Gửi câu hỏi tới bên vận hành',
        html: `<p>Email tiếp nhận của Nhóm vận hành Tính Điểm THPT là <a href="mailto:hotro.tinhdiemthpt@gmail.com">hotro.tinhdiemthpt@gmail.com</a>. Bạn có thể gửi câu hỏi về cách dùng công cụ, lỗi gặp khi thao tác, góp ý nội dung và yêu cầu liên quan tới dữ liệu của mình.</p>
<p>Hãy đặt tiêu đề theo việc cần xử lý, chẳng hạn “Lỗi tính học bạ”, “Góp ý công thức của trường” hoặc “Yêu cầu về dữ liệu tài khoản”. Trong thư, nêu trang hoặc công cụ bạn đang dùng và điều bạn muốn được kiểm tra.</p>`
      },
      {
        id: 'bao-loi-cong-cu',
        title: 'Cách mô tả lỗi để kiểm tra lại',
        html: `<p>Một báo lỗi có đủ bước thao tác giúp bên vận hành phân biệt lỗi dữ liệu với lỗi hiển thị hoặc kết nối. Bạn nên kèm:</p>
<ul>
<li>Thiết bị, trình duyệt và thời điểm xảy ra lỗi.</li>
<li>Công cụ đã mở, phương thức, năm xét tuyển và các lựa chọn liên quan.</li>
<li>Các bước từ lúc mở trang đến khi lỗi xuất hiện; kết quả bạn chờ đợi và kết quả thực tế.</li>
<li>Nội dung thông báo lỗi hoặc ảnh chụp phần giao diện có vấn đề, nếu có.</li>
</ul>
<p>Ví dụ: “Trong Tính học bạ, tôi chọn phương thức và nhập đủ ba môn. Khi bấm tính, bảng kết quả vẫn trống. Lỗi xảy ra trên điện thoại dùng Chrome lúc …”. Với lỗi tính điểm, dùng bộ điểm giả có thể tạo lại lỗi để tránh gửi thông tin học tập cá nhân không cần thiết.</p>`
      },
      {
        id: 'bao-sai-du-lieu',
        title: 'Báo thông tin trường hoặc ngành cần sửa',
        html: `<p>Trong <a href="/#universities">hồ sơ trường</a>, bấm “Báo dữ liệu sai”; trong dòng ngành, bấm “Báo sai”. Form này giữ ngữ cảnh trường hoặc ngành giúp xác định đúng dữ liệu bạn đang xem. Bạn chọn mục cần sửa, mô tả vấn đề và có thể thêm giá trị đề xuất cùng liên kết kiểm chứng.</p>
<p>Chỉ thao tác “Gửi báo cáo” mới gửi nội dung tới hệ thống tiếp nhận. “Tải JSON” và “Sao chép” tạo bản để bạn giữ hoặc gửi kèm email; chúng chưa gửi báo cáo. Nếu gửi trên website không thành công, bạn có thể dùng bản này để tránh phải nhập lại.</p>
<p>Xem <a href="/nguon-du-lieu-va-bao-sai/#gui-bao-sai">hướng dẫn báo sai</a> để chuẩn bị nguồn và kiểm tra thông báo sau khi gửi.</p>`
      },
      {
        id: 'tai-khoan-va-quyen-rieng-tu',
        title: 'Yêu cầu về tài khoản hoặc dữ liệu cá nhân',
        html: `<p>Nếu cần kiểm tra hoặc yêu cầu xóa tài khoản, bản sao dữ liệu hay báo cáo đã gửi, hãy nêu loại yêu cầu trong email. Với tài khoản, có thể cung cấp tên đăng nhập; với báo cáo, kèm mã báo cáo nếu có hoặc thời điểm và nội dung đủ để nhận diện.</p>
<p>Không gửi mật khẩu, mã xác thực, số CCCD hoặc ảnh học bạ chưa che thông tin cá nhân. Việc xử lý yêu cầu về tài khoản có thể cần xác minh chủ tài khoản. Các quyền, giới hạn của thao tác xóa và thời hạn pháp luật được trình bày trong <a href="/privacy">chính sách quyền riêng tư</a>.</p>`
      },
      {
        id: 'noi-dung-va-ban-quyen',
        title: 'Góp ý nguồn hoặc quyền đối với nội dung',
        html: `<p>Nếu bạn cho rằng một tài liệu hoặc hình ảnh trên website cần kiểm tra quyền sử dụng, hãy gửi địa chỉ trang, tên tài liệu, phần nội dung liên quan và thông tin về nguồn hoặc quyền của bạn. Với đề thi, thêm môn, năm và mã đề để xác định đúng bộ tài liệu.</p>
<p>Tránh gửi lại toàn bộ tài liệu khi một liên kết và phần mô tả đã đủ để nhận diện. Việc ghi nguồn trên website không tự xác nhận quyền đăng lại tài liệu.</p>`
      },
      {
        id: 'mang-xa-hoi',
        title: 'Các kênh kết nối',
        html: `<ul>
<li><a href="https://www.facebook.com/tinhdiemthpt/" target="_blank" rel="noopener noreferrer">Facebook Tính Điểm THPT</a></li>
<li><a href="https://www.youtube.com/@tinhdiemthpt" target="_blank" rel="noopener noreferrer">YouTube Tính Điểm THPT</a></li>
<li><a href="https://www.tiktok.com/@tinhdiemthpt" target="_blank" rel="noopener noreferrer">TikTok Tính Điểm THPT</a></li>
</ul>
<p>Đối với yêu cầu liên quan tới tài khoản hoặc cần đính kèm thông tin kiểm chứng, hãy gửi email để nội dung nằm trong cùng một cuộc trao đổi. Không đăng thông tin cá nhân ở phần bình luận công khai.</p>`
      }
    ]
  },
  {
    slug: 'dieu-khoan-su-dung',
    title: 'Điều khoản sử dụng',
    description: 'Phạm vi sử dụng kết quả tính điểm, dữ liệu tuyển sinh, phòng thi thử, tài khoản và nội dung trên Tính Điểm THPT.',
    updated: '2026-10-12',
    sections: [
      {
        id: 'pham-vi',
        title: 'Phạm vi của website',
        html: `<p>Tính Điểm THPT cung cấp công cụ tính điểm, tra cứu tuyển sinh và luyện tập để bạn chuẩn bị lựa chọn học tập. Nhóm vận hành Tính Điểm THPT tiếp nhận vấn đề liên quan tới việc sử dụng website qua <a href="mailto:hotro.tinhdiemthpt@gmail.com">hotro.tinhdiemthpt@gmail.com</a>.</p>
<p>Kết quả trên website phụ thuộc vào dữ liệu bạn nhập, phương thức bạn chọn và thông tin hiện có. Trước khi nộp hồ sơ, hãy đối chiếu thông báo chính thức về điều kiện, công thức, tổ hợp, thời hạn và cách đăng ký của trường.</p>`
      },
      {
        id: 'ket-qua-tuyen-sinh',
        title: 'Cách dùng điểm và thông tin tuyển sinh',
        html: `<p>Bạn chịu trách nhiệm kiểm tra điểm đầu vào, khu vực và đối tượng ưu tiên của mình. Mở “Xem cách tính” khi cần kiểm tra công thức hoặc từng thành phần của kết quả. Không dùng điểm tính theo một phương thức để đối chiếu với thang điểm hoặc điều kiện của phương thức khác.</p>
<p>Website dành cho kế hoạch tuyển sinh 2027, trong khi hồ sơ, điểm chuẩn và công thức 2026 đang được dùng làm dữ liệu tham khảo. Các trạng thái “Đã xác minh”, “Tham khảo” và “Đang cập nhật” gắn với phần dữ liệu được trình bày; chúng không xác nhận bạn đủ điều kiện hoặc sẽ trúng tuyển.</p>
<p>Việc lưu ngành, xếp nguyện vọng hoặc xuất PDF trên website tạo bản chuẩn bị cá nhân. Các thao tác này không gửi hồ sơ tới trường hoặc hệ thống tuyển sinh.</p>`
      },
      {
        id: 'tai-khoan',
        title: 'Tài khoản và việc giữ dữ liệu của bạn',
        html: `<p>Các công cụ chính có thể dùng mà không cần tài khoản. Nếu tạo tài khoản, hãy dùng thông tin đăng nhập do bạn quản lý và mật khẩu riêng. Đăng xuất khi dùng xong máy chung để tránh người khác truy cập dữ liệu công cụ đang lưu.</p>
<p>Xóa dữ liệu trên thiết bị và xóa bản sao trong tài khoản là hai việc khác nhau. Đăng xuất không xóa tài khoản. Cách xử lý dữ liệu, cơ chế lưu bản sao và gửi yêu cầu xóa được nêu trong <a href="/privacy">chính sách quyền riêng tư</a>. File đã tải về nằm trên thiết bị của bạn và cần được bạn quản lý.</p>`
      },
      {
        id: 'quet-anh-va-tro-ly',
        title: 'Quét học bạ, trợ lý và luyện thi',
        html: `<p>Nhận diện ảnh là bước hỗ trợ nhập điểm. Hãy che thông tin định danh trước khi chọn ảnh, đọc lựa chọn đồng ý gửi ảnh và đối chiếu điểm nhận diện với ảnh gốc trước khi xác nhận. Bạn có thể nhập điểm bằng tay nếu không muốn dùng nhận diện ảnh.</p>
<p>Câu trả lời của trợ lý có thể thiếu thông tin hoặc diễn giải sai. Với nội dung ảnh hưởng tới hồ sơ xét tuyển, kiểm tra lại ở thông báo chính thức. Không gửi mật khẩu, mã xác thực hoặc thông tin riêng của người khác trong câu hỏi.</p>
<p>Điểm phòng thi thử phản ánh bài làm trên bộ câu hỏi và đáp án đang có. Một số câu có lời giải tham khảo, một số câu chỉ có đáp án. Hãy báo lỗi nếu thấy câu hỏi, đáp án hoặc cách chấm cần kiểm tra; kết quả luyện tập không thay thế điểm của kỳ thi thực tế.</p>`
      },
      {
        id: 'dong-gop-va-noi-dung',
        title: 'Gửi góp ý và sử dụng nội dung',
        html: `<p>Khi gửi báo sai, mô tả đúng vấn đề bạn gặp và dùng nguồn có thể kiểm tra. Tránh đưa thông tin cá nhân không cần thiết vào báo cáo, gửi nội dung lặp hoặc dùng chức năng tiếp nhận để phát tán quảng cáo. Báo cáo được nhận để kiểm tra; nội dung đề xuất không tự động thay đổi dữ liệu công khai.</p>
<p>Quyền đối với đề thi, hình ảnh, lời giải và tài liệu nguồn phụ thuộc vào chủ sở hữu và điều kiện sử dụng của từng tài liệu. Không suy ra quyền sao chép, phân phối lại hoặc sử dụng thương mại chỉ vì bạn xem được tài liệu trên website. Khi sử dụng thông tin, giữ nguồn và kiểm tra điều kiện áp dụng của nội dung đó.</p>
<p>Nếu có yêu cầu kiểm tra quyền sử dụng, gửi địa chỉ trang và thông tin nhận diện tài liệu theo <a href="/lien-he/#noi-dung-va-ban-quyen">hướng dẫn liên hệ về nội dung</a>.</p>`
      },
      {
        id: 'cap-nhat',
        title: 'Thay đổi và phản hồi',
        html: `<p>Chức năng và nội dung có thể thay đổi khi dữ liệu được sửa hoặc bổ sung. Ngày cập nhật ở đầu trang cho biết phiên bản điều khoản đang được công bố. Bạn có thể gửi câu hỏi về một phần chưa rõ tới email hỗ trợ.</p>
<p>Để tìm hiểu nguồn, trạng thái xác minh và cách gửi báo cáo, xem <a href="/nguon-du-lieu-va-bao-sai/">nguồn dữ liệu và báo sai</a>. Hướng dẫn thao tác với công cụ nằm ở <a href="/#guide">mục hướng dẫn sử dụng</a>.</p>`
      }
    ]
  },
  {
    slug: 'nguon-du-lieu-va-bao-sai',
    title: 'Nguồn dữ liệu và cách báo sai',
    description: 'Hiểu trạng thái dữ liệu tuyển sinh, phân biệt tham khảo 2026 với kế hoạch 2027 và gửi báo sai kèm nguồn kiểm chứng.',
    updated: '2026-10-12',
    sections: [
      {
        id: 'nam-va-nguon',
        title: 'Kiểm tra năm tuyển sinh trước khi dùng dữ liệu',
        html: `<p>Website hướng tới thí sinh chuẩn bị cho năm 2027. Hồ sơ trường, điểm chuẩn và công thức tuyển sinh 2026 là dữ liệu tham khảo; quy tắc của năm 2026 không được áp dụng mặc định cho năm 2027. Nếu trường công bố thông tin mới, bạn cần kiểm tra đúng văn bản của năm đăng ký.</p>
<p>Thông tin tuyển sinh được tổng hợp từ thông báo của trường và các nguồn tra cứu, với mức độ xác minh khác nhau. Hồ sơ có liên kết website của trường; một số mục có tài liệu về cách tính điểm để bạn mở đối chiếu. Khi đọc nguồn, kiểm tra tên cơ sở, chương trình, phương thức và ngày công bố thay vì chỉ xem mức điểm.</p>`
      },
      {
        id: 'trang-thai',
        title: 'Các nhãn dữ liệu có ý nghĩa gì?',
        html: `<dl>
<dt>Đã xác minh</dt><dd>Phần dữ liệu được ghi nhận đã có căn cứ đối chiếu theo trạng thái đang công bố. Kiểm tra năm và phạm vi áp dụng ngay bên cạnh; một mục được xác minh không có nghĩa toàn bộ hồ sơ đều đầy đủ.</dd>
<dt>Xác minh một phần</dt><dd>Hồ sơ có cả mục đã đối chiếu và mục còn tham khảo hoặc đang cập nhật. Đọc trạng thái của từng ngành và phương thức trước khi sử dụng.</dd>
<dt>Tham khảo</dt><dd>Thông tin được giữ để hỗ trợ tra cứu nhưng cần đối chiếu thêm với thông báo chính thức. Điểm tham khảo phải được đọc cùng năm, phương thức và thang điểm.</dd>
<dt>Đang cập nhật, chưa xác minh hoặc chưa công bố</dt><dd>Mục chưa có đủ dữ liệu để công bố kết quả theo trạng thái tương ứng. Ô chưa có điểm không được hiểu là điểm bằng 0.</dd>
</dl>
<p>Trong <a href="/#admission">công thức theo trường</a>, một phương thức có thể chỉ được mô tả để tham khảo nếu chưa đủ căn cứ tính tự động. Bạn nên đọc cả điều kiện và ngành áp dụng của công thức.</p>`
      },
      {
        id: 'doi-chieu-diem',
        title: 'Đối chiếu điểm mà không lẫn phương thức',
        html: `<p>Trước khi so sánh, kiểm tra bốn thông tin: năm tuyển sinh, mã ngành hoặc chương trình, phương thức và thang điểm. Nếu có môn nhân hệ số, quy đổi chứng chỉ hay điều kiện riêng, xem quy tắc của chính phương thức đó.</p>
<p>Ví dụ, một ngành có mức điểm theo thi THPT và mức điểm theo kỳ thi đánh giá năng lực. Bạn cần chọn dòng tương ứng với loại điểm đang có; không so hai con số chỉ vì chúng cùng nằm trong hồ sơ một ngành. Chênh lệch so với điểm chuẩn năm 2026 là thông tin tham khảo để tìm hiểu tiếp.</p>`
      },
      {
        id: 'gui-bao-sai',
        title: 'Gửi báo sai ngay tại dữ liệu đang xem',
        html: `<ol>
<li>Mở <a href="/#universities">hồ sơ trường</a> rồi bấm “Báo dữ liệu sai”, hoặc bấm “Báo sai” cạnh dòng ngành cần kiểm tra.</li>
<li>Chọn mục cần sửa, chẳng hạn mã ngành, tổ hợp, phương thức, điểm chuẩn hoặc công thức. Mô tả phải dài từ 15 đến 1.000 ký tự và nêu rõ điểm chưa đúng.</li>
<li>Thêm giá trị đề xuất và liên kết kiểm chứng nếu có. Liên kết cần bắt đầu bằng http:// hoặc https://; nên dẫn thẳng tới thông báo hoặc tài liệu liên quan.</li>
<li>Bấm “Gửi báo cáo”, hoàn tất bước xác minh khi được yêu cầu rồi đọc thông báo kết quả. Giữ mã báo cáo được hiển thị để dùng khi cần liên hệ lại.</li>
</ol>
<p>Báo cáo đã nhận là nội dung chờ kiểm tra, không tự thay đổi dữ liệu công khai. Nếu giao diện báo chưa gửi được, bạn có thể dùng “Tải JSON” hoặc “Sao chép” để giữ bản báo cáo và gửi qua <a href="mailto:hotro.tinhdiemthpt@gmail.com">email hỗ trợ</a>. Hai thao tác này chưa gửi báo cáo tới website.</p>`
      },
      {
        id: 'noi-dung-bao-cao',
        title: 'Một báo cáo dễ đối chiếu gồm những gì?',
        html: `<p>Nêu đúng trường, mã ngành hoặc chương trình, năm và phương thức đang xem. Ghi giá trị hiện có trên website, giá trị bạn cho là đúng và vị trí trong tài liệu giúp đối chiếu, như tên bảng hoặc số trang.</p>
<p>Ví dụ: “Trong hồ sơ trường X, dòng ngành Y theo phương thức THPT năm 2026 đang ghi tổ hợp A00. Thông báo ở liên kết dưới đây, bảng ngành tại trang Z, ghi thêm A01. Đề nghị kiểm tra phạm vi chương trình trước khi sửa.” Đây là mẫu cách trình bày, không phải báo cáo về một trường cụ thể.</p>
<p>Nguồn không bắt buộc trong form, nhưng một liên kết trực tiếp cùng vị trí cần đọc giúp kiểm tra đề xuất. Không gửi mật khẩu, mã xác thực hoặc thông tin cá nhân không liên quan. Dữ liệu báo cáo và cách gửi yêu cầu về báo cáo được giải thích trong <a href="/privacy">chính sách quyền riêng tư</a>.</p>`
      },
      {
        id: 'nguon-de-thi',
        title: 'Nguồn đề, đáp án và lời giải luyện tập',
        html: `<p>Phòng thi thử ghi nguồn do người dùng cung cấp ngay ở từng bộ đề. Tên và mã đề được giữ theo tài liệu; nhãn “Tài liệu 2026” chưa phải xác nhận nguồn chính thức. Câu hỏi và đáp án đã được số hóa để làm bài; một số bộ đề có lời giải tham khảo theo câu hoặc ảnh tài liệu đối chiếu.</p>
<p>Đáp án dùng để chấm và lời giải cần được đối chiếu với nguồn chính thức khi có. Liên kết tới một trang đáp án tham khảo không tự xác nhận đó là đáp án chính thức. Nếu thiếu bước, khác đáp án hoặc có lỗi hiển thị, hãy ghi rõ môn, mã đề, phần và số câu khi <a href="/lien-he/">liên hệ hỗ trợ</a>.</p>
<p>Nguồn về định dạng đề và nguồn của một bộ đề là hai thông tin khác nhau. Một liên kết giải thích cấu trúc bài thi không tự xác nhận toàn bộ câu hỏi hoặc đáp án của bộ đề đang xem. Tài liệu được đăng công khai hay được người dùng cung cấp cũng chưa đủ để xác nhận quyền đăng lại.</p>
<p>Nếu cần kiểm tra quyền sử dụng một tài liệu, gửi đường dẫn và thông tin nhận diện tới Nhóm vận hành Tính Điểm THPT qua email hỗ trợ. Nội dung bạn gửi giúp xác định đúng phần cần rà soát.</p>`
      }
    ]
  }
];
