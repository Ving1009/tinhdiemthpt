const test = async () => {
  const list = [
    { code: "DHP", slug: "dai-hoc-quan-ly-va-cong-nghe-hai-phong" },
    { code: "KTC", slug: "dai-hoc-kien-truc-tp-hcm-co-so-can-tho" },
    { code: "KTL", slug: "dai-hoc-kien-truc-tp-hcm-co-so-da-lat" },
    { code: "NLT", slug: "dai-hoc-nong-lam-tp-hcm-phan-hieu-ninh-thuan" },
    { code: "NTA", slug: "dai-hoc-ngoai-thuong-co-so-quang-ninh" },
    { code: "DLT", slug: "dai-hoc-lao-dong-xa-hoi-co-so-son-tay" }
  ];

  for (const item of list) {
    const url = `https://diemthi.tuyensinh247.com/diem-chuan/${item.slug}-${item.code}.html`;
    const res = await fetch(url);
    console.log(item.code, res.status);
    if (res.ok) {
      const html = await res.text();
      console.log(`  Table: ${html.includes('<table')}`);
    }
  }
};
test();
