export const GIFT_GUIDE_SLUGS = [
  'personalized-family-christmas-ornaments',
  'first-christmas-married-gifts',
  'personalized-pet-ornaments',
  'custom-gifts-for-grandparents',
] as const;

export type GiftGuideSlug = (typeof GIFT_GUIDE_SLUGS)[number];
export type GiftGuideLocale = 'en' | 'vi' | 'zh';

export interface GiftGuideContent {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  cta: string;
  productsHeading: string;
  productsDescription: string;
  emptyProducts: string;
  whyHeading: string;
  reasons: { title: string; description: string }[];
  tipsHeading: string;
  tips: string[];
  faqHeading: string;
  faqs: { q: string; a: string }[];
}

export interface GiftGuideDefinition {
  slug: GiftGuideSlug;
  searchTerms: string[];
  productTerms: string[];
  keywords: string[];
  content: Record<GiftGuideLocale, GiftGuideContent>;
}

const GUIDES: Record<GiftGuideSlug, GiftGuideDefinition> = {
  'personalized-family-christmas-ornaments': {
    slug: 'personalized-family-christmas-ornaments',
    searchTerms: ['family christmas ornament', 'christmas ornament', 'personalized family'],
    productTerms: ['family'],
    keywords: [
      'personalized family Christmas ornaments',
      'custom family ornament',
      'family name Christmas decoration',
    ],
    content: {
      en: {
        title: 'Personalized Family Christmas Ornaments',
        description: 'Create a personalized family Christmas ornament with names, dates, and details that turn this holiday into a keepsake.',
        eyebrow: 'Made for your family',
        heading: 'Personalized family Christmas ornaments that tell your story',
        intro: 'Celebrate the people who make Christmas feel like home. Add family names, a meaningful date, or a short message to create a keepsake designed for your tree and your traditions.',
        cta: 'Shop family ornaments',
        productsHeading: 'Family keepsakes to personalize',
        productsDescription: 'Choose a design, select the available options, and add the names or details that make it yours.',
        emptyProducts: 'New family ornament designs are being prepared. Explore all personalized gifts while they arrive.',
        whyHeading: 'A small decoration with a lasting story',
        reasons: [
          { title: 'Made for your household', description: 'Include the names, year, and details that represent your family today.' },
          { title: 'Ready to give', description: 'A thoughtful choice for parents, siblings, newly blended families, and close friends.' },
          { title: 'A tradition worth repeating', description: 'Create a new ornament as your family grows and your Christmas story changes.' },
        ],
        tipsHeading: 'How to choose the right family ornament',
        tips: [
          'Count every name before choosing the family-size option.',
          'Use the year or a short message instead of a long sentence.',
          'Review spelling carefully because personalized details are made to order.',
        ],
        faqHeading: 'Family ornament questions',
        faqs: [
          { q: 'What can I personalize on a family Christmas ornament?', a: 'Available options vary by design and may include names, a year, a short message, colors, or a family size.' },
          { q: 'Can I preview the names before placing my request?', a: 'The product page shows the fields required for the design. The shop confirms personalized details before production when a proof is available.' },
          { q: 'When should I order for Christmas?', a: 'Order early and check the processing and delivery estimate on the product page. Personalized products need production time before shipping.' },
        ],
      },
      vi: {
        title: 'Đồ trang trí Giáng Sinh cá nhân hóa cho gia đình',
        description: 'Tạo đồ trang trí Giáng Sinh cá nhân hóa với tên, năm và lời nhắn để lưu giữ câu chuyện của gia đình bạn.',
        eyebrow: 'Dành riêng cho gia đình bạn',
        heading: 'Đồ trang trí Giáng Sinh kể câu chuyện của cả gia đình',
        intro: 'Lưu lại những cái tên khiến Giáng Sinh trở thành cảm giác được về nhà. Thêm tên thành viên, một năm đáng nhớ hoặc lời nhắn ngắn để tạo món đồ dành riêng cho cây thông và truyền thống gia đình.',
        cta: 'Xem đồ trang trí gia đình',
        productsHeading: 'Món kỷ niệm gia đình có thể cá nhân hóa',
        productsDescription: 'Chọn thiết kế, tùy chọn phù hợp và thêm những cái tên hoặc chi tiết của riêng bạn.',
        emptyProducts: 'Các thiết kế mới đang được chuẩn bị. Trong lúc chờ, bạn có thể khám phá toàn bộ quà tặng cá nhân hóa.',
        whyHeading: 'Một món đồ nhỏ lưu giữ câu chuyện dài lâu',
        reasons: [
          { title: 'Đúng với gia đình hiện tại', description: 'Thêm tên, năm và những chi tiết thể hiện gia đình bạn hôm nay.' },
          { title: 'Một món quà có ý nghĩa', description: 'Phù hợp tặng bố mẹ, anh chị em, gia đình mới hoặc những người bạn thân.' },
          { title: 'Tạo nên truyền thống', description: 'Thêm một món mới mỗi khi gia đình lớn lên và câu chuyện Giáng Sinh thay đổi.' },
        ],
        tipsHeading: 'Cách chọn thiết kế phù hợp',
        tips: [
          'Đếm đủ số tên trước khi chọn tùy chọn số thành viên.',
          'Ưu tiên năm hoặc lời nhắn ngắn thay vì một câu quá dài.',
          'Kiểm tra kỹ chính tả vì sản phẩm cá nhân hóa được làm theo yêu cầu.',
        ],
        faqHeading: 'Câu hỏi về đồ trang trí gia đình',
        faqs: [
          { q: 'Tôi có thể cá nhân hóa những gì?', a: 'Tùy thiết kế, bạn có thể thêm tên, năm, lời nhắn ngắn, màu sắc hoặc số thành viên.' },
          { q: 'Tôi có được xem lại tên trước khi đặt không?', a: 'Trang sản phẩm hiển thị các thông tin cần nhập. Shop sẽ xác nhận chi tiết cá nhân hóa trước khi sản xuất nếu thiết kế có bản duyệt.' },
          { q: 'Nên đặt trước Giáng Sinh bao lâu?', a: 'Hãy đặt sớm và kiểm tra thời gian xử lý, giao hàng trên trang sản phẩm vì hàng cá nhân hóa cần thời gian sản xuất.' },
        ],
      },
      zh: {
        title: '个性化家庭圣诞挂饰',
        description: '用家人的姓名、年份和专属文字定制圣诞挂饰，把今年的节日记忆变成值得珍藏的纪念品。',
        eyebrow: '为你的家人专属制作',
        heading: '讲述家庭故事的个性化圣诞挂饰',
        intro: '把让圣诞节充满家的感觉的人记录下来。添加家人姓名、特别年份或简短祝福，为圣诞树和家庭传统制作一份专属纪念品。',
        cta: '选购家庭挂饰',
        productsHeading: '可个性化的家庭纪念品',
        productsDescription: '选择设计和可用选项，再添加属于你们的姓名或细节。',
        emptyProducts: '新的家庭挂饰正在准备中，你也可以先浏览全部个性化礼物。',
        whyHeading: '小小挂饰，保存长久故事',
        reasons: [
          { title: '记录现在的家庭', description: '加入姓名、年份和能代表你们家庭的细节。' },
          { title: '适合送礼', description: '适合送给父母、兄弟姐妹、新组建的家庭或亲密朋友。' },
          { title: '延续圣诞传统', description: '随着家庭成长，每年增加一件新的纪念挂饰。' },
        ],
        tipsHeading: '如何选择合适的家庭挂饰',
        tips: ['选择家庭人数前先核对所有姓名。', '优先使用年份或简短祝福，避免文字过长。', '个性化商品按需制作，请仔细检查拼写。'],
        faqHeading: '家庭挂饰常见问题',
        faqs: [
          { q: '家庭圣诞挂饰可以定制哪些内容？', a: '不同设计可提供姓名、年份、简短文字、颜色或家庭人数等选项。' },
          { q: '提交请求前可以预览姓名吗？', a: '商品页会显示该设计需要填写的内容。如提供效果图，店铺会在制作前确认个性化细节。' },
          { q: '圣诞节前应该何时下单？', a: '请尽早下单，并查看商品页的制作与配送时间。个性化商品发货前需要制作。' },
        ],
      },
    },
  },
  'first-christmas-married-gifts': {
    slug: 'first-christmas-married-gifts',
    searchTerms: ['first christmas', 'married', 'wedding', 'couple', 'anniversary gift'],
    productTerms: ['first christmas', 'married', 'newlywed', 'newly wed', 'wedding', 'couple', 'anniversary'],
    keywords: ['first Christmas married gifts', 'newlywed Christmas ornament', 'couple Christmas keepsake'],
    content: {
      en: {
        title: 'First Christmas Married Gifts',
        description: 'Mark a newlywed couple’s first holiday together with personalized first Christmas married gifts and keepsake ornaments.',
        eyebrow: 'A new chapter together',
        heading: 'First Christmas married gifts made for the memory',
        intro: 'Their first Christmas as a married couple only happens once. Celebrate the new family name, wedding year, or favorite photo with a personalized keepsake they can bring out every holiday.',
        cta: 'Shop newlywed gifts',
        productsHeading: 'Personalized gifts for newlyweds',
        productsDescription: 'Find an ornament or keepsake that can carry their names, wedding date, or first married Christmas.',
        emptyProducts: 'Newlywed designs are being added. Explore all personalized gifts for a thoughtful alternative.',
        whyHeading: 'Celebrate more than a date',
        reasons: [
          { title: 'Personal to the couple', description: 'Use their names, wedding date, new surname, or a message that belongs to them.' },
          { title: 'Easy to display every year', description: 'An ornament becomes part of the couple’s holiday routine, not a gift stored away.' },
          { title: 'Made for close relationships', description: 'A warm choice from parents, siblings, the wedding party, or one spouse to the other.' },
        ],
        tipsHeading: 'Details that make the gift feel right',
        tips: ['Confirm how the couple uses their names.', 'Choose the wedding year or the year of their first married Christmas.', 'Add a short message that will still feel meaningful years from now.'],
        faqHeading: 'Newlywed Christmas gift questions',
        faqs: [
          { q: 'What date should go on a first Christmas married gift?', a: 'Most people use the wedding date or simply the year of the couple’s first Christmas after marriage.' },
          { q: 'Can I send the gift directly to the couple?', a: 'Delivery options depend on the shop. Enter the recipient’s delivery address during the order request and review the available gift options.' },
          { q: 'Can both surnames be included?', a: 'If the design has enough space, enter both surnames exactly as they should appear and the shop will confirm the request.' },
        ],
      },
      vi: {
        title: 'Quà Giáng Sinh đầu tiên sau kết hôn',
        description: 'Đánh dấu mùa lễ đầu tiên của cặp đôi mới cưới bằng món quà và đồ trang trí Giáng Sinh được cá nhân hóa.',
        eyebrow: 'Một chương mới bên nhau',
        heading: 'Món quà lưu giữ Giáng Sinh đầu tiên sau kết hôn',
        intro: 'Giáng Sinh đầu tiên với tư cách vợ chồng chỉ đến một lần. Hãy lưu lại tên gia đình mới, năm cưới hoặc bức ảnh yêu thích bằng món kỷ niệm có thể được mang ra mỗi mùa lễ.',
        cta: 'Xem quà cho cặp đôi mới cưới',
        productsHeading: 'Quà cá nhân hóa cho cặp đôi mới cưới',
        productsDescription: 'Chọn món đồ có thể thêm tên, ngày cưới hoặc dấu mốc Giáng Sinh đầu tiên của hai người.',
        emptyProducts: 'Các thiết kế cho cặp đôi đang được bổ sung. Bạn có thể khám phá toàn bộ quà cá nhân hóa để tìm lựa chọn khác.',
        whyHeading: 'Kỷ niệm nhiều hơn một ngày tháng',
        reasons: [
          { title: 'Riêng cho cặp đôi', description: 'Thêm tên, ngày cưới, họ mới hoặc lời nhắn chỉ thuộc về hai người.' },
          { title: 'Có thể trưng bày mỗi năm', description: 'Món đồ trở thành một phần của mùa lễ thay vì bị cất đi sau khi tặng.' },
          { title: 'Phù hợp với người thân', description: 'Một lựa chọn ấm áp từ bố mẹ, anh chị em, bạn thân hoặc từ người bạn đời.' },
        ],
        tipsHeading: 'Những chi tiết làm món quà ý nghĩa hơn',
        tips: ['Xác nhận cách cặp đôi muốn sử dụng tên.', 'Chọn năm cưới hoặc năm của Giáng Sinh đầu tiên sau kết hôn.', 'Viết lời nhắn ngắn vẫn còn ý nghĩa sau nhiều năm.'],
        faqHeading: 'Câu hỏi về quà Giáng Sinh cho người mới cưới',
        faqs: [
          { q: 'Nên ghi ngày nào trên món quà?', a: 'Bạn có thể dùng ngày cưới hoặc chỉ ghi năm của mùa Giáng Sinh đầu tiên sau kết hôn.' },
          { q: 'Có thể gửi thẳng đến cặp đôi không?', a: 'Tùy chọn giao hàng phụ thuộc vào shop. Hãy nhập địa chỉ người nhận khi gửi yêu cầu và kiểm tra tùy chọn quà tặng.' },
          { q: 'Có thể ghi cả hai họ không?', a: 'Nếu thiết kế đủ chỗ, hãy nhập chính xác cả hai họ; shop sẽ xác nhận lại yêu cầu.' },
        ],
      },
      zh: {
        title: '婚后第一个圣诞节礼物',
        description: '用个性化的新婚圣诞礼物和纪念挂饰，记录夫妻共同度过的第一个节日。',
        eyebrow: '一起开启新篇章',
        heading: '为婚后第一个圣诞节留下专属纪念',
        intro: '婚后第一个圣诞节只有一次。用新家庭姓名、结婚年份或喜爱的照片制作一件每年都能拿出来的个性化纪念品。',
        cta: '选购新婚礼物',
        productsHeading: '送给新婚夫妻的个性化礼物',
        productsDescription: '选择可以加入姓名、结婚日期或婚后首个圣诞年份的挂饰与纪念品。',
        emptyProducts: '新婚主题设计正在添加中，你也可以浏览全部个性化礼物。',
        whyHeading: '纪念的不只是一年',
        reasons: [
          { title: '属于两个人', description: '加入姓名、结婚日期、新姓氏或专属祝福。' },
          { title: '每年都能展示', description: '让礼物成为每年节日布置的一部分，而不是被收进柜子。' },
          { title: '适合亲近的人赠送', description: '父母、兄弟姐妹、伴郎伴娘或夫妻彼此赠送都很合适。' },
        ],
        tipsHeading: '让礼物更贴心的细节',
        tips: ['确认夫妻希望如何使用姓名。', '选择结婚年份或婚后第一个圣诞节的年份。', '使用多年后依然有意义的简短祝福。'],
        faqHeading: '新婚圣诞礼物常见问题',
        faqs: [
          { q: '礼物上应该写哪个日期？', a: '通常可以使用结婚日期，或只写婚后第一个圣诞节的年份。' },
          { q: '可以直接寄给夫妻吗？', a: '配送方式取决于店铺。提交订单请求时填写收件地址，并查看可用的礼品选项。' },
          { q: '可以同时写两个姓氏吗？', a: '如果设计空间足够，请准确填写两个姓氏，店铺会再次确认。' },
        ],
      },
    },
  },
  'personalized-pet-ornaments': {
    slug: 'personalized-pet-ornaments',
    searchTerms: ['pet ornament', 'dog ornament', 'cat ornament', 'christmas ornament'],
    productTerms: ['pet', 'dog', 'cat', 'paw'],
    keywords: ['personalized pet ornaments', 'custom dog Christmas ornament', 'pet memorial ornament'],
    content: {
      en: {
        title: 'Personalized Pet Ornaments',
        description: 'Celebrate a dog, cat, or much-loved companion with a personalized pet ornament featuring their name, photo, or special year.',
        eyebrow: 'Every family member belongs on the tree',
        heading: 'Personalized pet ornaments for the companions you love',
        intro: 'Put their name, portrait, or most memorable expression at the heart of your holiday decor. A custom pet ornament can celebrate a new companion or honor one whose place in the family never changes.',
        cta: 'Shop pet ornaments',
        productsHeading: 'Pet keepsakes to make your own',
        productsDescription: 'Explore designs that can be personalized with a name, photo, breed, year, or short message.',
        emptyProducts: 'New pet designs are on the way. Explore all personalized gifts while the collection grows.',
        whyHeading: 'Made for more than a pet name',
        reasons: [
          { title: 'Capture their personality', description: 'Choose a favorite photo, familiar colors, or a phrase that sounds exactly like them.' },
          { title: 'Welcome or remember', description: 'Celebrate a first Christmas together or create a gentle memorial keepsake.' },
          { title: 'A thoughtful gift for pet people', description: 'Give something personal to the friend who treats their companion like family.' },
        ],
        tipsHeading: 'Getting the best personalized result',
        tips: ['Use a clear, well-lit photo with the face fully visible.', 'Check the pet’s name and memorial dates carefully.', 'Choose a simple background when the design uses a portrait.'],
        faqHeading: 'Pet ornament questions',
        faqs: [
          { q: 'What kind of photo works best?', a: 'A sharp, well-lit image with the pet facing the camera and little covering the face usually produces the clearest result.' },
          { q: 'Can I include more than one pet?', a: 'Some designs support multiple pets. Check the available personalization fields and select the matching option before submitting.' },
          { q: 'Can the ornament be made as a memorial?', a: 'Yes. Designs that accept a year or message can often include memorial dates or a short remembrance.' },
        ],
      },
      vi: {
        title: 'Đồ trang trí thú cưng cá nhân hóa',
        description: 'Lưu giữ hình ảnh chó, mèo hoặc người bạn nhỏ yêu quý bằng món đồ trang trí có tên, ảnh hoặc năm đặc biệt.',
        eyebrow: 'Mọi thành viên đều xứng đáng có mặt trên cây thông',
        heading: 'Đồ trang trí cá nhân hóa dành cho người bạn nhỏ bạn yêu thương',
        intro: 'Đưa tên, chân dung hoặc biểu cảm đáng nhớ của thú cưng vào trung tâm mùa lễ. Món đồ có thể đánh dấu Giáng Sinh đầu tiên bên nhau hoặc tưởng nhớ người bạn luôn có một vị trí trong gia đình.',
        cta: 'Xem đồ trang trí thú cưng',
        productsHeading: 'Món kỷ niệm thú cưng dành riêng cho bạn',
        productsDescription: 'Khám phá thiết kế có thể thêm tên, ảnh, giống, năm hoặc lời nhắn ngắn.',
        emptyProducts: 'Các thiết kế thú cưng mới đang được chuẩn bị. Bạn có thể xem toàn bộ quà cá nhân hóa trong lúc chờ.',
        whyHeading: 'Không chỉ là một cái tên',
        reasons: [
          { title: 'Lưu lại tính cách riêng', description: 'Chọn ảnh yêu thích, màu sắc quen thuộc hoặc câu nói khiến bạn nhớ ngay đến thú cưng.' },
          { title: 'Chào đón hoặc tưởng nhớ', description: 'Đánh dấu Giáng Sinh đầu tiên hoặc tạo món kỷ niệm nhẹ nhàng cho người bạn đã rời xa.' },
          { title: 'Món quà cho người yêu thú cưng', description: 'Tặng một điều thật riêng cho người luôn coi thú cưng là gia đình.' },
        ],
        tipsHeading: 'Cách có kết quả cá nhân hóa đẹp',
        tips: ['Dùng ảnh rõ, đủ sáng và thấy trọn khuôn mặt.', 'Kiểm tra kỹ tên và ngày tháng tưởng niệm.', 'Chọn nền đơn giản nếu thiết kế sử dụng chân dung.'],
        faqHeading: 'Câu hỏi về đồ trang trí thú cưng',
        faqs: [
          { q: 'Nên dùng ảnh như thế nào?', a: 'Ảnh rõ, đủ sáng, thú cưng nhìn về phía máy ảnh và khuôn mặt không bị che thường cho kết quả tốt nhất.' },
          { q: 'Có thể thêm nhiều thú cưng không?', a: 'Một số thiết kế hỗ trợ nhiều thú cưng. Hãy kiểm tra các trường cá nhân hóa và chọn đúng tùy chọn.' },
          { q: 'Có thể làm món tưởng niệm không?', a: 'Có. Thiết kế cho phép thêm năm hoặc lời nhắn thường có thể ghi ngày tưởng niệm hoặc câu nhắn ngắn.' },
        ],
      },
      zh: {
        title: '个性化宠物圣诞挂饰',
        description: '用姓名、照片或特别年份定制宠物挂饰，纪念狗狗、猫咪或深爱的陪伴者。',
        eyebrow: '每一位家人都应该出现在圣诞树上',
        heading: '为深爱的陪伴者定制宠物挂饰',
        intro: '把宠物的名字、肖像或最难忘的表情放进节日装饰里。定制挂饰既能庆祝相伴的第一个圣诞节，也能纪念家庭中永远不变的位置。',
        cta: '选购宠物挂饰',
        productsHeading: '专属于你的宠物纪念品',
        productsDescription: '选择可以添加姓名、照片、品种、年份或简短文字的设计。',
        emptyProducts: '新的宠物主题设计正在准备中，你也可以先浏览全部个性化礼物。',
        whyHeading: '记录的不只是名字',
        reasons: [
          { title: '展现独特性格', description: '选择喜爱的照片、熟悉的颜色或一眼就让人想起它的话。' },
          { title: '欢迎或纪念', description: '庆祝相伴的第一个圣诞节，或制作一件温柔的纪念品。' },
          { title: '送给爱宠人士', description: '为把宠物视为家人的朋友送上一份真正专属的礼物。' },
        ],
        tipsHeading: '获得更好定制效果的方法',
        tips: ['使用清晰、光线充足且完整露出面部的照片。', '仔细核对宠物姓名和纪念日期。', '肖像设计尽量选择简洁背景。'],
        faqHeading: '宠物挂饰常见问题',
        faqs: [
          { q: '哪种照片效果最好？', a: '清晰、光线充足、宠物面向镜头且面部无遮挡的照片通常效果最好。' },
          { q: '可以加入多只宠物吗？', a: '部分设计支持多只宠物，请查看个性化字段并选择对应选项。' },
          { q: '可以制作纪念挂饰吗？', a: '可以。支持年份或文字的设计通常可以加入纪念日期或简短寄语。' },
        ],
      },
    },
  },
  'custom-gifts-for-grandparents': {
    slug: 'custom-gifts-for-grandparents',
    searchTerms: ['grandparents', 'grandma', 'grandpa', 'family christmas ornament'],
    productTerms: ['grandparent', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'nana', 'papa'],
    keywords: ['custom gifts for grandparents', 'personalized grandma gift', 'personalized grandpa gift'],
    content: {
      en: {
        title: 'Custom Gifts for Grandparents',
        description: 'Find custom gifts for grandparents featuring family names, grandchildren, photos, and meaningful messages made just for them.',
        eyebrow: 'Made for the heart of the family',
        heading: 'Custom gifts for grandparents filled with family meaning',
        intro: 'The best gifts for grandparents make the whole family feel close. Personalize a keepsake with grandchildren’s names, a family photo, an important date, or the words they always say.',
        cta: 'Shop gifts for grandparents',
        productsHeading: 'Personalized keepsakes for grandparents',
        productsDescription: 'Explore gifts that can include family names, photos, dates, and messages they will recognize immediately.',
        emptyProducts: 'Grandparent gift designs are being added. Explore all personalized gifts to find another meaningful keepsake.',
        whyHeading: 'Put the family story in the gift',
        reasons: [
          { title: 'Include every grandchild', description: 'Choose a design with enough space for the names that matter most.' },
          { title: 'Useful for many occasions', description: 'A personal choice for Christmas, birthdays, anniversaries, or a just-because surprise.' },
          { title: 'More meaningful over time', description: 'Names, photos, and family dates turn a simple object into part of the family history.' },
        ],
        tipsHeading: 'How to personalize for grandparents',
        tips: ['Use the name they love being called, such as Grandma, Nana, Grandpa, or Pop.', 'Arrange grandchildren’s names in the preferred order.', 'Choose a message that sounds like your family, not a generic greeting.'],
        faqHeading: 'Grandparent gift questions',
        faqs: [
          { q: 'Can all grandchildren’s names be included?', a: 'Many designs offer several name slots. Check the product options for the maximum and verify every spelling before submitting.' },
          { q: 'What occasions are custom grandparent gifts suitable for?', a: 'They work well for Christmas, birthdays, anniversaries, Grandparents Day, new grandparents, and family reunions.' },
          { q: 'Can I use a family nickname instead of Grandma or Grandpa?', a: 'Yes, when the design includes an editable title or name field, enter the family nickname exactly as it should appear.' },
        ],
      },
      vi: {
        title: 'Quà tặng cá nhân hóa cho ông bà',
        description: 'Tìm món quà dành riêng cho ông bà với tên con cháu, ảnh gia đình, ngày đáng nhớ và lời nhắn đầy ý nghĩa.',
        eyebrow: 'Dành cho người giữ trái tim của gia đình',
        heading: 'Quà tặng cho ông bà chứa đầy ý nghĩa gia đình',
        intro: 'Món quà ý nghĩa nhất giúp ông bà cảm thấy cả gia đình luôn ở gần. Hãy thêm tên các cháu, ảnh gia đình, ngày đặc biệt hoặc câu nói quen thuộc vào một món kỷ niệm riêng.',
        cta: 'Xem quà dành cho ông bà',
        productsHeading: 'Món kỷ niệm cá nhân hóa cho ông bà',
        productsDescription: 'Khám phá quà tặng có thể thêm tên, ảnh, ngày tháng và lời nhắn thân thuộc.',
        emptyProducts: 'Các thiết kế dành cho ông bà đang được bổ sung. Bạn có thể xem toàn bộ quà cá nhân hóa để tìm lựa chọn khác.',
        whyHeading: 'Đưa câu chuyện gia đình vào món quà',
        reasons: [
          { title: 'Có tên của từng người cháu', description: 'Chọn thiết kế đủ chỗ cho những cái tên quan trọng nhất.' },
          { title: 'Phù hợp nhiều dịp', description: 'Một lựa chọn riêng cho Giáng Sinh, sinh nhật, kỷ niệm hoặc món quà bất ngờ.' },
          { title: 'Càng lâu càng ý nghĩa', description: 'Tên, ảnh và ngày gia đình biến một món đồ thành một phần lịch sử chung.' },
        ],
        tipsHeading: 'Cách cá nhân hóa quà cho ông bà',
        tips: ['Dùng cách xưng hô ông bà yêu thích.', 'Sắp xếp tên các cháu theo thứ tự mong muốn.', 'Chọn lời nhắn mang giọng nói của gia đình thay vì câu chúc chung chung.'],
        faqHeading: 'Câu hỏi về quà dành cho ông bà',
        faqs: [
          { q: 'Có thể thêm tên của tất cả các cháu không?', a: 'Nhiều thiết kế có nhiều vị trí điền tên. Hãy kiểm tra số lượng tối đa và chính tả trước khi gửi yêu cầu.' },
          { q: 'Quà cá nhân hóa phù hợp dịp nào?', a: 'Phù hợp cho Giáng Sinh, sinh nhật, kỷ niệm, ngày dành cho ông bà, khi mới lên chức hoặc dịp đoàn tụ.' },
          { q: 'Có thể dùng biệt danh gia đình không?', a: 'Có. Nếu thiết kế có trường tên hoặc danh xưng có thể sửa, hãy nhập chính xác biệt danh muốn hiển thị.' },
        ],
      },
      zh: {
        title: '送给祖父母的定制礼物',
        description: '用孙辈姓名、家庭照片、重要日期和专属文字，为祖父母挑选一份真正属于他们的定制礼物。',
        eyebrow: '送给家庭的温暖中心',
        heading: '充满家庭意义的祖父母定制礼物',
        intro: '最好的礼物能让祖父母感到全家都在身边。用孙辈姓名、家庭照片、重要日期或熟悉的话语制作一份专属纪念品。',
        cta: '选购祖父母礼物',
        productsHeading: '送给祖父母的个性化纪念品',
        productsDescription: '选择可以加入家庭姓名、照片、日期和熟悉祝福的礼物。',
        emptyProducts: '祖父母主题设计正在添加中，你也可以浏览全部个性化礼物。',
        whyHeading: '把家庭故事放进礼物里',
        reasons: [
          { title: '加入每位孙辈的姓名', description: '选择有足够空间记录所有重要姓名的设计。' },
          { title: '适合多种场合', description: '适合圣诞节、生日、纪念日或平日里的惊喜。' },
          { title: '时间越久越珍贵', description: '姓名、照片和家庭日期让普通物品成为家庭历史的一部分。' },
        ],
        tipsHeading: '为祖父母定制礼物的方法',
        tips: ['使用他们最喜欢的家庭称呼。', '按希望的顺序排列孙辈姓名。', '选择像家人说话的祝福，而不是通用句子。'],
        faqHeading: '祖父母礼物常见问题',
        faqs: [
          { q: '可以加入所有孙辈的姓名吗？', a: '许多设计提供多个姓名位置，请查看商品的最大数量并在提交前核对拼写。' },
          { q: '定制祖父母礼物适合哪些场合？', a: '适合圣诞节、生日、纪念日、祖父母节、初为祖父母或家庭团聚。' },
          { q: '可以使用家庭昵称吗？', a: '可以。如果设计提供可编辑的称呼或姓名字段，请准确填写希望显示的昵称。' },
        ],
      },
    },
  },
};

export function isGiftGuideSlug(value: string): value is GiftGuideSlug {
  return GIFT_GUIDE_SLUGS.includes(value as GiftGuideSlug);
}

export function getGiftGuide(slug: string): GiftGuideDefinition | null {
  return isGiftGuideSlug(slug) ? GUIDES[slug] : null;
}

export function getGiftGuideContent(guide: GiftGuideDefinition, locale: string): GiftGuideContent {
  return guide.content[locale as GiftGuideLocale] ?? guide.content.en;
}

export function isGiftGuideProduct(
  guide: GiftGuideDefinition,
  product: { name?: string; shortDescription?: string },
): boolean {
  const searchable = `${product.name ?? ''} ${product.shortDescription ?? ''}`.toLocaleLowerCase('en');
  return guide.productTerms.some((term) => searchable.includes(term));
}
