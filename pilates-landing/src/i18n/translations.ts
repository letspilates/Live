export type Lang = 'en' | 'ko';

/**
 * All user-facing copy. English is the studio's primary voice; Korean is the
 * secondary toggle. Both objects share the exact same shape — `Content` is
 * derived from the English tree so the Korean tree is type-checked against it.
 */
const en = {
  nav: {
    links: [
      { label: 'About', href: '#about' },
      { label: 'Programs', href: '#programs' },
      { label: 'Training', href: '#approach' },
      { label: 'Instructors', href: '#instructors' },
      { label: 'Schedule', href: '#schedule' },
    ],
    cta: 'Book a trial',
  },
  hero: {
    eyebrow: 'Pilates · Gyrotonic® studio',
    title: ['Movement,', 'made to measure'],
    titleAccentIndex: 1,
    body: 'In our Los Angeles studio, STOTT PILATES® and the GYROTONIC® Method are taught the way they were meant to be — one body, one instructor, full attention. Strength, length, and ease that follow you out the door.',
    primaryCta: 'Book your first trial class',
    secondaryCta: 'Explore the programs',
    stats: [
      { value: 'Est. 2015', label: 'Los Angeles studio' },
      { value: '1:1', label: 'Private-first instruction' },
      { value: 'STOTT PILATES® · GYROTONIC®', label: 'Fully certified team' },
    ],
    chipTop: 'Open this week',
    chipBottom: 'Weekdays 07:00 – 22:00',
  },
  about: {
    eyebrow: 'How we work',
    title: ['Not more exercise —', 'exactly', 'the right exercise'],
    titleAccentIndex: 1,
    body: 'Every journey begins with an assessment. We map your spinal range, breathing pattern, and left-right asymmetry before you ever touch the equipment. The resistance of the Reformer and the spiraling work of Gyrotonic® speak different languages toward the same goal — a body that moves more freely.',
    caption: 'Los Angeles · the studio',
  },
  programs: {
    eyebrow: 'Programs',
    title: ['Considered movement,', 'crafted', 'for every body'],
    titleAccentIndex: 1,
    body: 'Pilates & Gyrotonic® for all levels — led by our fully certified STOTT PILATES® & GYROTONIC® team.',
    items: {
      private: {
        badge: 'Pilates · Gyrotonic®',
        title: 'Private',
        desc: 'One-on-one sessions on fully customized apparatus. Precision-led, rotational movement that builds flexibility, strength, and lasting stability — tailored entirely to you.',
        meta: '1:1 · fully private',
      },
      duet: {
        badge: 'Pilates · Gyrotonic®',
        title: 'Duet',
        desc: 'Train alongside a partner with the focused attention of a dedicated instructor. Shared energy, individual results.',
        meta: '1:2 · with a partner',
      },
      gyroGroup: {
        badge: 'Gyrotonic®',
        title: 'Gyrotonic® Group',
        desc: 'Fluid, circular movement in an intimate group setting. Expert guidance meets shared momentum — progress, made together.',
        meta: 'Intimate group',
      },
      pilatesGroup: {
        badge: 'Pilates · Gyrotonic®',
        title: 'Pilates Group',
        desc: 'A small group of five. Personalized Pilates instruction with room to breathe, guided in a warm, supportive space.',
      },
    },
  },
  approach: {
    eyebrow: 'Teacher training',
    title: ['GYROTONIC® Level 1', 'Instructor Training Program', 'pathway'],
    titleAccentIndex: 1,
    metricValue: 'Level 1',
    metricLabel: 'Internationally recognized GYROTONIC® certification',
    steps: [
      {
        no: '01',
        title: 'Pre-Training Course',
        body: 'A six-day immersion in the fundamentals of the GYROTONIC® Method — taken after experiencing the work with a licensed trainer, two weeks to three months before the Foundation Course.',
      },
      {
        no: '02',
        title: 'Foundation Course',
        body: 'Twelve days of in-depth study of the Level 1 exercise syllabus — the heart of the certification pathway.',
      },
      {
        no: '03',
        title: 'Apprenticeship',
        body: 'Up to one year of practice teaching, plus a supervised six-day Apprentice Review Course guided by a GYROTONIC® Master Trainer.',
      },
      {
        no: '04',
        title: 'Final Certificate Course',
        body: 'A three-day evaluation, taken at least six months after the Foundation Course. Pass, and you teach as a certified GYROTONIC® Level 1 Trainer.',
      },
    ],
    note: {
      badge: 'In-studio program',
      lead: 'Hosted at Let’s Pilates LA',
      sub: 'Led in-studio by our Certified GYROTONIC® Pre-Trainer. Certified trainers keep their license active with continuing education every two years.',
      linkLabel: 'Official program details',
      cta: 'Ask about upcoming courses',
    },
  },
  trainingForm: {
    title: 'Course Registration',
    subtitle:
      'Select the courses you are interested in and leave your details — we will reply with schedules and next steps.',
    stepLabels: ['Programs', 'Information', 'Confirmation'],
    s1Title: 'Program Selection',
    s1Subtitle: 'Please select the course(s) you wish to attend.',
    courses: [
      { id: 'A', name: 'GYROTONIC® Level 1 Foundation Course', tag: '12 days' },
      { id: 'B', name: 'GYROTONIC® Level 2 Program 1 — Pre-Training', tag: '3 days' },
      { id: 'C', name: 'GYROTONIC® Jumping Stretching Board Course', tag: '7 days' },
      { id: 'D', name: 'GYROTONIC® Level 1 Apprentice Review Course', tag: '6 days' },
      { id: 'E', name: 'GYROTONIC® Level 2 Program 1 — Foundation Course', tag: '4 days' },
    ],
    courseMeta: 'Dates to be announced',
    seatsLeft: '{n} spots left',
    seatsFull: 'Full',
    seatsFullNote: 'This course is fully booked — contact us to join the waitlist.',
    s2Title: 'Personal Information',
    s2Subtitle: 'Please provide your contact details for registration.',
    lblName: 'Full name',
    phName: 'Your full name',
    lblEmail: 'Email address',
    lblPhone: 'Phone number',
    phPhone: '(555) 123-4567',
    lblCert: 'Current certification status',
    phCert: 'e.g., Level 1 Pre-Training completed',
    lblStudio: 'Studio affiliation',
    phStudio: 'Studio name',
    lblCity: 'City / State',
    phCity: 'City, State',
    lblQuestions: 'Questions or additional requests',
    phQuestions: 'Any questions, notes, or special requests...',
    s3Title: 'Final Confirmation',
    s3Subtitle: 'Just a few more details to complete your registration.',
    lblStage: 'What is your current stage in the GYROTONIC® educational track?',
    stageOptions: [
      'New Student',
      'Level 1 Trainee',
      'Apprentice',
      'Certified Trainer',
      'Continuing Education',
      'Other',
    ],
    phStageOther: 'Please specify...',
    lblPrereq: 'Do you meet the prerequisite requirements for your selected course(s)?',
    prereqOptions: ['Yes', 'No', 'Not sure'],
    lblAvail: 'Are you fully available for all scheduled training dates?',
    availOptions: ['Yes', 'No', 'Need to discuss'],
    lblAnything: 'Anything else we should know?',
    phAnything: 'Physical concerns, prior training details, questions...',
    optional: '(Optional)',
    btnNext: 'Next',
    btnBack: 'Back',
    btnSubmit: 'Submit registration',
    btnSubmitting: 'Submitting...',
    btnClose: 'Close',
    errCourse: 'Please select at least one course to continue.',
    errPersonal: 'Please fill in all required fields.',
    errSubmit: 'Submission failed. Please try again.',
    tyTitle: 'Thank you',
    tyMsg:
      'Thank you for your interest in our GYROTONIC® educational courses. Our team will review your information and contact you with the next steps.',
  },
  instructors: {
    eyebrow: 'Instructors',
    title: ['Four internationally', 'certified', 'dedicated instructors'],
    titleAccentIndex: 1,
    body: 'Every instructor is certified through the international GYROTONIC® and STOTT PILATES® programs. The instructor who runs your first assessment stays with you to the end.',
    people: {
      sunnie: {
        name: 'Sunnie Lee',
        role: 'Master Level Instructor',
        certs: ['Certified GYROTONIC® Pre-Trainer', 'STOTT PILATES® Certified Instructor'],
      },
      eunice: {
        name: 'Eunice Choi',
        role: 'Instructor',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'Gyrokinesis®', 'Archway', 'GYROTONIC® Jumping Stretching Board'],
      },
      soo: {
        name: 'Su Kyung Yi',
        role: 'Instructor',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'GYROTONIC® Jumping Stretching Board'],
      },
      haley: {
        name: 'Haley Han',
        role: 'Instructor',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'GYROTONIC® Jumping Stretching Board'],
      },
    },
  },
  testimonials: {
    eyebrow: 'Member stories',
    title: ['What consistency leaves behind'],
    ratingLabel: ['Naver booking rating', '1,142 reviews to date'],
    reviews: {
      r1: {
        quote:
          'After a disc diagnosis I was scared to move, but the step-by-step assessment got me running again in six months. Reviewing the pain journal together made all the difference.',
        name: 'Jiho Yoon',
        meta: 'Reformer · Rehab / 11 months',
      },
      r2: {
        quote:
          'Gyrotonic® was new to me, and the way my stiff shoulders open up feels different every session.',
        name: 'Yeonwoo Seo',
        meta: 'Gyrotonic® / 7 months',
      },
      r3: {
        quote:
          'My instructor rebuilt my postpartum core step by step. Seeing recovery in numbers keeps me motivated.',
        name: 'Garam Han',
        meta: 'Pre/Postnatal private / 5 months',
      },
      r4: {
        quote:
          "Three years in. My instructor hasn't changed and knows my whole body history — that's the real value.",
        name: 'Minjae Oh',
        meta: 'Reformer 1:2 / 3 years',
      },
      r5: {
        quote:
          'The 7am class made my whole day lighter. The space is quiet and full of natural light.',
        name: 'Sua Bae',
        meta: 'Gyrokinesis® mat / 1 year',
      },
    },
  },
  schedule: {
    eyebrow: 'Schedule',
    title: ['Pick a time —', 'we hold', 'your spot'],
    titleAccentIndex: 1,
    body: 'The schedule below is our live Mindbody booking system — what you see is what is open right now. Choose a class, book, and you are set.',
    note: 'All times are shown in Pacific Time (PT).',
  },
  cta: {
    eyebrow: 'First step',
    title: ['Today, let your body', 'move again'],
    body: "One assessment is enough. See for yourself where to start and what could change.",
    primary: 'Book a trial class',
    secondary: 'Meet the instructors',
  },
  faq: {
    eyebrow: 'FAQ',
    title: ['Questions,', 'answered'],
    titleAccentIndex: 1,
    items: [
      {
        q: 'Where is Let’s Pilates LA located?',
        a: 'We’re in Los Angeles at 672 S La Fayette Park Pl, Ste 674 — an easy reach from Koreatown, Westlake, and Downtown LA.',
      },
      {
        q: 'What’s the difference between Pilates and Gyrotonic®?',
        a: 'Pilates builds core strength, control, and alignment — often on the Reformer. The GYROTONIC® Method uses circular, spiraling movement to mobilize the joints and lengthen the spine. Many members combine both.',
      },
      {
        q: 'I’m a complete beginner — where do I start?',
        a: 'Every journey begins with a movement assessment, followed by a private 1:1 session built around your body. No prior experience needed.',
      },
      {
        q: 'Do you only offer private sessions, or groups too?',
        a: 'Both. Private (1:1), Duet (1:2), GYROTONIC® Group, and Pilates Group (up to five people).',
      },
      {
        q: 'How do I book a class?',
        a: 'Use the live schedule on this page — it’s connected to our Mindbody system in real time, so what you see is what’s open right now. Pick a time and book.',
      },
      {
        q: 'Are your instructors certified?',
        a: 'Yes. Every instructor holds international STOTT PILATES® and GYROTONIC® certifications, led by our Certified GYROTONIC® Pre-Trainer.',
      },
      {
        q: 'Do you teach in Korean?',
        a: 'Yes — our instructors teach in both English and Korean.',
      },
      {
        q: 'What should I wear to my first session?',
        a: 'Comfortable athletic wear you can move in; grip socks are recommended. All equipment is provided — just bring water and yourself.',
      },
      {
        q: 'Do you offer GYROTONIC® teacher training?',
        a: 'Yes — we host the GYROTONIC® Level 1 certification pathway in-studio, led by a GYROTONIC® Master Trainer together with our Certified Pre-Trainer.',
      },
      {
        q: 'What courses make up the GYROTONIC® certification?',
        a: 'The Level 1 pathway has four stages: the Pre-Training Course (6 days on the fundamentals), the Foundation Course (12 days on the full Level 1 syllabus), an Apprenticeship (up to a year of practice teaching plus a supervised 6-day Apprentice Review Course), and the Final Certificate Course (a 3-day evaluation). Full details at gyrotonic.com/teacher-training.',
      },
    ],
  },
  footer: {
    description:
      'Movement, completed through STOTT PILATES® and Gyrotonic® — a Los Angeles studio designing the exercise that fits your body.',
    address: ['672 S La Fayette Park Pl, STE 674, Los Angeles, CA 90057', 'Class times — see the live schedule above'],
    cols: {
      programs: {
        title: 'Programs',
        links: ['Private', 'Duet', 'Gyrotonic® Group', 'Pilates Group'],
      },
      studio: {
        title: 'Studio',
        links: ['About', 'Instructors', 'Schedule', 'Find us'],
      },
      contact: {
        title: 'Contact',
        links: ['Instagram @Letspilates_la', 'KakaoTalk sunnie0210', '310-995-0046'],
      },
    },
    rights: "© 2026 Let's Pilates LA. All rights reserved.",
    legal: ['Terms', 'Privacy'],
    langBadge: 'EN · English',
  },
};

// English defines the canonical shape; the Korean tree is type-checked against
// it. No `as const`, so strings infer as `string` and arrays as mutable — the
// two trees only need to share the same structure, not the same values.
export type Content = typeof en;

const ko: Content = {
  nav: {
    links: [
      { label: '소개', href: '#about' },
      { label: '프로그램', href: '#programs' },
      { label: '지도자 과정', href: '#approach' },
      { label: '강사', href: '#instructors' },
      { label: '수업 일정', href: '#schedule' },
    ],
    cta: '체험 예약',
  },
  hero: {
    eyebrow: '필라테스 · 자이로토닉® 스튜디오',
    title: ['당신만을 위한', '움직임'],
    titleAccentIndex: 0,
    body: 'Let’s Pilates LA는 STOTT PILATES®와 GYROTONIC®의 공식 교육 방식에 따라 수업을 진행합니다. 모든 수업은 한 명의 강사가 회원 한 분에게 집중하는 1:1 개인 레슨으로 진행됩니다. 몸의 균형과 움직임을 개선하고, 그 변화가 일상까지 이어질 수 있도록 함께합니다.',
    primaryCta: '첫 체험 수업 예약하기',
    secondaryCta: '프로그램 살펴보기',
    stats: [
      { value: 'Est. 2015', label: '로스앤젤레스 스튜디오' },
      { value: '1:1', label: '1:1 중심 수업' },
      { value: 'STOTT PILATES® · GYROTONIC®', label: '전원 공인 강사진' },
    ],
    chipTop: '이번 주 예약 가능',
    chipBottom: '평일 07:00 – 22:00',
  },
  about: {
    eyebrow: '수업 방식',
    title: ['많이 하는 운동보다,', '내 몸에 맞는 운동'],
    titleAccentIndex: 1,
    body: '모든 수업은 몸의 움직임을 이해하는 것에서 시작합니다. 수업을 시작하기 전 척추의 움직임, 호흡 패턴, 관절의 가동 범위와 좌우 균형을 세심하게 확인합니다.\n\n리포머와 GYROTONIC®은 접근 방식은 다르지만 목표는 같습니다. 몸을 더욱 편안하고 자유롭게 움직일 수 있도록 돕는 것입니다.',
    caption: '로스앤젤레스 스튜디오',
  },
  programs: {
    eyebrow: '프로그램',
    title: ['당신의 몸에 맞춰', '설계된 프로그램'],
    titleAccentIndex: 1,
    body: '운동 경험과 현재 몸의 상태에 맞춰 STOTT PILATES®와 GYROTONIC® 국제 공인 강사진이 개인별 프로그램을 제공합니다.',
    items: {
      private: {
        badge: 'Pilates · Gyrotonic®',
        title: '프라이빗',
        desc: '당신에게 맞춰 세팅한 기구로 진행하는 1:1 수업. 정교하게 이끄는 회전 움직임이 유연성과 근력, 그리고 오래가는 안정성을 만들어냅니다.',
        meta: '1:1 · 개인 수업',
      },
      duet: {
        badge: 'Pilates · Gyrotonic®',
        title: '듀엣',
        desc: '전담 강사가 곁에서 세심하게 봐주는 가운데, 파트너와 나란히 운동합니다. 함께 나누는 에너지, 각자에게 남는 결과.',
        meta: '1:2 · 파트너와 함께',
      },
      gyroGroup: {
        badge: 'Gyrotonic®',
        title: 'Gyrotonic® 그룹',
        desc: '소규모로 모여 물 흐르듯 이어가는 원형 움직임. 전문 강사의 가이드와 함께하는 리듬 속에서, 나란히 나아갑니다.',
        meta: '소규모 그룹',
      },
      pilatesGroup: {
        badge: 'Pilates · Gyrotonic®',
        title: '필라테스 그룹',
        desc: '정원 다섯 명의 소그룹. 따뜻하고 편안한 공간에서, 한 사람 한 사람을 챙기는 여유로운 필라테스 수업.',
      },
    },
  },
  approach: {
    eyebrow: '지도자 과정',
    title: ['GYROTONIC® Level 1', '지도자 양성 과정'],
    titleAccentIndex: 1,
    metricValue: 'Level 1',
    metricLabel: '국제 공인 GYROTONIC® 자격',
    steps: [
      {
        no: '01',
        title: '프리트레이닝 코스',
        body: '6일간 GYROTONIC® 메소드의 기본 원리에 집중합니다. 공인 트레이너의 수업을 직접 경험한 뒤, 파운데이션 코스 2주에서 3개월 전 사이에 수강합니다.',
      },
      {
        no: '02',
        title: '파운데이션 코스',
        body: '12일 동안 레벨 1 운동 커리큘럼을 깊이 있게 익힙니다. 자격 과정의 심장과도 같은 단계입니다.',
      },
      {
        no: '03',
        title: '어프렌티스십',
        body: '최대 1년간 직접 가르치며 실습하고, GYROTONIC® 마스터 트레이너의 지도 아래 6일간의 어프렌티스 리뷰 코스를 거칩니다.',
      },
      {
        no: '04',
        title: '파이널 서티피케이트 코스',
        body: '파운데이션 수료 후 최소 6개월이 지나 치르는 3일간의 평가. 통과하면 GYROTONIC® 레벨 1 공인 트레이너로 활동하게 됩니다.',
      },
    ],
    note: {
      badge: '스튜디오 현장 과정',
      lead: '레츠 필라테스 LA에서 열립니다',
      sub: 'GYROTONIC® 공인 프리트레이너가 스튜디오에서 직접 지도합니다. 공인 트레이너는 2년마다 보수 교육을 이수하며 자격을 유지합니다.',
      linkLabel: '공식 프로그램 안내',
      cta: '개강 일정 문의하기',
    },
  },
  trainingForm: {
    title: '지도자 과정 등록 신청',
    subtitle:
      '관심 있는 과정을 선택하고 연락처를 남겨주세요. 일정과 다음 단계를 안내드리겠습니다.',
    stepLabels: ['프로그램', '개인정보', '최종확인'],
    s1Title: '프로그램 선택',
    s1Subtitle: '수강을 희망하는 과정을 선택해 주세요.',
    courses: [
      { id: 'A', name: 'GYROTONIC® Level 1 기초 과정 (Foundation Course)', tag: '12일' },
      { id: 'B', name: 'GYROTONIC® Level 2 Program 1 — 사전 교육 (Pre-Training)', tag: '3일' },
      { id: 'C', name: 'GYROTONIC® 점핑 스트레칭 보드 과정 (Jumping Stretching Board)', tag: '7일' },
      { id: 'D', name: 'GYROTONIC® Level 1 견습 리뷰 과정 (Apprentice Review)', tag: '6일' },
      { id: 'E', name: 'GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)', tag: '4일' },
    ],
    courseMeta: '일정 추후 공지',
    seatsLeft: '{n}자리 남음',
    seatsFull: '마감',
    seatsFullNote: '정원이 마감되었습니다 — 대기 신청은 문의해 주세요.',
    s2Title: '개인 정보',
    s2Subtitle: '등록 및 연락을 위한 정보를 입력해 주세요.',
    lblName: '성함',
    phName: '성함을 입력해 주세요',
    lblEmail: '이메일 주소',
    lblPhone: '전화번호',
    phPhone: '010-1234-5678',
    lblCert: '현재 자격 상태',
    phCert: '예: Level 1 Pre-Training 수료',
    lblStudio: '소속 스튜디오',
    phStudio: '소속 스튜디오명',
    lblCity: '도시 / 지역',
    phCity: '도시, 지역',
    lblQuestions: '질문 또는 추가 요청사항',
    phQuestions: '질문이나 요청사항을 입력해 주세요...',
    s3Title: '최종 확인',
    s3Subtitle: '등록을 완료하기 위해 몇 가지만 더 확인해 주세요.',
    lblStage: '현재 GYROTONIC® 교육 과정에서 어떤 단계에 있으신가요?',
    stageOptions: [
      '신규 수강생',
      'Level 1 수련생',
      '견습생 (Apprentice)',
      '인증 트레이너',
      '보수 교육',
      '기타',
    ],
    phStageOther: '기타 사항을 입력해 주세요...',
    lblPrereq: '선택하신 과정의 선수과목 요건을 충족하시나요?',
    prereqOptions: ['예', '아니오', '잘 모르겠습니다'],
    lblAvail: '모든 교육 일정에 참석 가능하신가요?',
    availOptions: ['예', '아니오', '상담 필요'],
    lblAnything: '그 외 알려주실 사항이 있으신가요?',
    phAnything: '신체적 우려사항, 이전 교육 이력, 질문 등...',
    optional: '(선택사항)',
    btnNext: '다음',
    btnBack: '이전',
    btnSubmit: '등록 신청하기',
    btnSubmitting: '제출 중...',
    btnClose: '닫기',
    errCourse: '최소 하나의 과정을 선택해 주세요.',
    errPersonal: '필수 항목을 모두 입력해 주세요.',
    errSubmit: '제출에 실패했습니다. 다시 시도해 주세요.',
    tyTitle: '감사합니다',
    tyMsg: 'GYROTONIC® 교육 과정에 관심을 가져주셔서 감사합니다. 접수 내용을 검토한 후 다음 단계를 안내드리겠습니다.',
  },
  instructors: {
    eyebrow: '강사진',
    title: ['국제 공인 자격을 갖춘', '전문 강사진'],
    titleAccentIndex: 1,
    body: '모든 강사는 STOTT PILATES®와 GYROTONIC®의 국제 공인 자격을 보유하고 있습니다. 첫 상담부터 이후의 수업까지 담당 강사가 회원님의 변화를 꾸준히 함께합니다.',
    people: {
      sunnie: {
        name: 'Sunnie Lee',
        role: '마스터 레벨 강사',
        certs: ['GYROTONIC® 공인 프리트레이너', 'STOTT PILATES® 공인 강사'],
      },
      eunice: {
        name: 'Eunice Choi',
        role: '강사',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'Gyrokinesis®', 'Archway', 'GYROTONIC® Jumping Stretching Board'],
      },
      soo: {
        name: 'Su Kyung Yi',
        role: '강사',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'GYROTONIC® Jumping Stretching Board'],
      },
      haley: {
        name: 'Haley Han',
        role: '강사',
        certs: ['STOTT PILATES®', 'GYROTONIC® Level 1', 'GYROTONIC® Jumping Stretching Board'],
      },
    },
  },
  testimonials: {
    eyebrow: '회원의 기록',
    title: ['꾸준함이 남긴 후기'],
    ratingLabel: ['네이버 예약 평점', '누적 1,142개 리뷰'],
    reviews: {
      r1: {
        quote:
          '디스크 진단 이후 운동이 무서웠는데, 평가부터 차근차근 진행해줘서 6개월 만에 다시 러닝을 시작했어요. 통증 일지를 같이 봐주는 게 컸습니다.',
        name: '윤지호',
        meta: '리포머 · 재활 / 11개월째',
      },
      r2: {
        quote: '자이로토닉®은 처음이었는데, 굳어 있던 어깨가 풀리는 느낌이 회차마다 달라요.',
        name: '서연우',
        meta: '자이로토닉® / 7개월째',
      },
      r3: {
        quote: '출산 후 무너진 코어를 담당 선생님이 단계별로 잡아주셨어요. 숫자로 회복을 보여주니 동기부여가 됩니다.',
        name: '한가람',
        meta: '산전산후 프라이빗 / 5개월째',
      },
      r4: {
        quote: '3년째 다니는 중. 강사가 안 바뀌고 내 몸 히스토리를 다 알고 있다는 게 진짜 장점.',
        name: '오민재',
        meta: '리포머 1:2 / 3년째',
      },
      r5: {
        quote: '아침 7시 클래스 덕분에 하루가 가벼워졌어요. 공간도 조용하고 햇빛이 좋아요.',
        name: '배수아',
        meta: '자이로키네시스® 매트 / 1년째',
      },
    },
  },
  schedule: {
    eyebrow: '수업 예약',
    title: ['원하는 시간에', '바로 예약하세요'],
    titleAccentIndex: 1,
    body: '아래 일정은 Mindbody 예약 시스템과 실시간으로 연동됩니다. 표시되는 수업은 현재 예약 가능한 일정입니다. 원하는 수업과 시간을 선택해 간편하게 예약하세요.',
    note: '모든 시간은 미국 서부 시간(PT) 기준입니다.',
  },
  cta: {
    eyebrow: '첫 걸음',
    title: ['오늘,', '내 몸의 변화를 시작하세요'],
    body: '한 번의 상담과 움직임 평가로 시작할 수 있습니다. 현재 몸의 상태를 확인하고, 나에게 가장 잘 맞는 프로그램을 직접 경험해 보세요.',
    primary: '체험 수업 예약하기',
    secondary: '강사진 만나보기',
  },
  faq: {
    eyebrow: '자주 묻는 질문',
    title: ['궁금한 점,', '먼저 정리했어요'],
    titleAccentIndex: 1,
    items: [
      {
        q: 'Let’s Pilates LA는 어디에 있나요?',
        a: '로스앤젤레스 672 S La Fayette Park Pl, Ste 674에 있습니다. 코리아타운·웨스트레이크·다운타운 LA에서 가깝습니다.',
      },
      {
        q: '필라테스와 자이로토닉®은 어떻게 다른가요?',
        a: '필라테스는 주로 리포머 위에서 코어 근력과 컨트롤, 정렬을 다집니다. GYROTONIC®은 원을 그리는 나선형 움직임으로 관절을 풀고 척추를 길게 늘입니다. 두 가지를 함께 하시는 회원도 많습니다.',
      },
      {
        q: '완전 초보인데 무엇부터 시작하나요?',
        a: '모든 시작은 움직임 평가에서 출발합니다. 이후 몸에 맞춘 1:1 프라이빗 수업으로 이어지니, 경험이 없어도 괜찮습니다.',
      },
      {
        q: '프라이빗만 있나요, 그룹 수업도 있나요?',
        a: '둘 다 있습니다. 프라이빗(1:1), 듀엣(1:2), GYROTONIC® 그룹, 그리고 정원 다섯 명의 필라테스 그룹.',
      },
      {
        q: '예약은 어떻게 하나요?',
        a: '이 페이지의 실시간 일정표를 이용하세요. 마인드바디 시스템과 실시간으로 연동되어, 보이는 자리가 지금 예약 가능한 자리입니다. 원하는 시간을 골라 예약하시면 됩니다.',
      },
      {
        q: '강사진은 공인 자격이 있나요?',
        a: '네. 모든 강사가 STOTT PILATES®와 GYROTONIC® 국제 공인 자격을 보유하고 있으며, GYROTONIC® 공인 프리트레이너가 이끕니다.',
      },
      {
        q: '한국어 수업도 가능한가요?',
        a: '네 — 강사진이 영어와 한국어 모두로 수업을 진행합니다.',
      },
      {
        q: '첫 수업에 무엇을 입고 가야 하나요?',
        a: '움직이기 편한 운동복이면 됩니다. 그립 양말을 권장하고, 기구는 모두 준비되어 있으니 물과 몸만 오시면 됩니다.',
      },
      {
        q: '자이로토닉® 지도자 과정도 운영하나요?',
        a: '네 — GYROTONIC® 레벨 1 자격 과정을 스튜디오에서 진행합니다. GYROTONIC® 마스터 트레이너와 저희 공인 프리트레이너가 함께 이끕니다.',
      },
      {
        q: 'GYROTONIC® 자격 과정은 어떤 코스로 구성되나요?',
        a: '레벨 1 과정은 네 단계입니다. 프리트레이닝 코스(6일, 기본 원리), 파운데이션 코스(12일, 레벨 1 전체 커리큘럼), 어프렌티스십(최대 1년 티칭 실습과 감독하 6일 어프렌티스 리뷰 코스), 파이널 서티피케이트 코스(3일 평가). 자세한 내용은 gyrotonic.com/teacher-training에서 확인하세요.',
      },
    ],
  },
  footer: {
    description:
      'STOTT PILATES®와 자이로토닉®으로 완성하는 움직임. 당신의 몸에 꼭 맞는 운동을 설계하는 로스앤젤레스의 스튜디오입니다.',
    address: ['672 S La Fayette Park Pl, STE 674, Los Angeles, CA 90057', '수업 시간은 위 실시간 일정표에서 확인하세요'],
    cols: {
      programs: {
        title: '프로그램',
        links: ['프라이빗', '듀엣', 'Gyrotonic® 그룹', '필라테스 그룹'],
      },
      studio: {
        title: '스튜디오',
        links: ['소개', '강사진', '수업 일정', '오시는 길'],
      },
      contact: {
        title: '문의',
        links: ['인스타그램 @Letspilates_la', '카카오톡 sunnie0210', '310-995-0046'],
      },
    },
    rights: "© 2026 Let's Pilates LA. All rights reserved.",
    legal: ['이용약관', '개인정보처리방침'],
    langBadge: 'KR · 한국어',
  },
};

export const dict: Record<Lang, Content> = { en, ko };
