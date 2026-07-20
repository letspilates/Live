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
      { label: 'Coaches', href: '#instructors' },
      { label: 'Schedule', href: '#schedule' },
    ],
    cta: 'Book a trial',
  },
  hero: {
    eyebrow: 'Pilates · Gyrotonic studio',
    title: ['Movement,', 'made to measure'],
    titleAccentIndex: 1,
    body: 'In our Los Angeles studio, STOTT PILATES® and the GYROTONIC® Method are taught the way they were meant to be — one body, one instructor, full attention. Strength, length, and ease that follow you out the door.',
    primaryCta: 'Book your first trial class',
    secondaryCta: 'Explore the programs',
    stats: [
      { value: 'Est. 2015', label: 'Los Angeles studio' },
      { value: '1:1', label: 'Private-first coaching' },
      { value: 'STOTT PILATES® · GYROTONIC®', label: 'Fully certified team' },
    ],
    chipTop: 'Open this week',
    chipBottom: 'Weekdays 07:00 – 22:00',
  },
  about: {
    eyebrow: 'How we work',
    title: ['Not more exercise —', 'exactly', 'the right exercise'],
    titleAccentIndex: 1,
    body: 'Every journey begins with an assessment. We map your spinal range, breathing pattern, and left-right asymmetry before you ever touch the equipment. The resistance of the Reformer and the spiraling work of Gyrotonic speak different languages toward the same goal — a body that moves more freely.',
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
    title: ['GYROTONIC®', 'certified trainer', 'pathway'],
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
  instructors: {
    eyebrow: 'Coaches',
    title: ['Four internationally', 'certified', 'dedicated coaches'],
    titleAccentIndex: 1,
    body: 'Every coach is certified through the international GYROTONIC® and STOTT PILATES® programs. The coach who runs your first assessment stays with you to the end.',
    people: {
      sunnie: {
        name: 'Sunnie Lee',
        role: 'Master Level Instructor',
        certs: ['Certified GYROTONIC® Pre-Trainer', 'STOTT PILATES® Certified Instructor'],
      },
      eunice: {
        name: 'Eunice Choi',
        role: 'STOTT PILATES® Certified Instructor',
        certs: ['GYROTONIC® Level 1', 'Gyrokinesis', 'Archway', 'Jumping Stretching Board'],
      },
      soo: {
        name: 'Soo Kyoung Yi',
        role: 'STOTT PILATES® Certified Instructor',
        certs: ['GYROTONIC® Level 1', 'Gyrokinesis', 'Archway', 'Jumping Stretching Board'],
      },
      haley: {
        name: 'Haley Kim',
        role: 'GYROTONIC® Instructor',
        certs: ['GYROTONIC® Level 1', 'Jumping Stretching Board'],
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
          'Gyrotonic was new to me, and the way my stiff shoulders open up feels different every session.',
        name: 'Yeonwoo Seo',
        meta: 'Gyrotonic / 7 months',
      },
      r3: {
        quote:
          'Coach Siwoo rebuilt my postpartum core step by step. Seeing recovery in numbers keeps me motivated.',
        name: 'Garam Han',
        meta: 'Pre/Postnatal private / 5 months',
      },
      r4: {
        quote:
          "Three years in. My coach hasn't changed and knows my whole body history — that's the real value.",
        name: 'Minjae Oh',
        meta: 'Reformer 1:2 / 3 years',
      },
      r5: {
        quote:
          'The 7am class made my whole day lighter. The space is quiet and full of natural light.',
        name: 'Sua Bae',
        meta: 'Gyrokinesis mat / 1 year',
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
    secondary: 'Meet the coaches',
  },
  footer: {
    description:
      'Movement, completed through Reformer Pilates and Gyrotonic — a Los Angeles studio designing the exercise that fits your body.',
    address: ['672 S La Fayette Park Pl, STE 674, Los Angeles, CA 90057', 'Class times — see the live schedule above'],
    cols: {
      programs: {
        title: 'Programs',
        links: ['Reformer Pilates', 'Gyrotonic', 'Gyrokinesis Mat', 'Private & Recovery'],
      },
      studio: {
        title: 'Studio',
        links: ['About', 'Coaches', 'Schedule', 'Find us'],
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
    eyebrow: '필라테스 · 자이로토닉 스튜디오',
    title: ['당신에게 맞춰', '짓는 움직임'],
    titleAccentIndex: 1,
    body: '로스앤젤레스의 저희 스튜디오는 STOTT PILATES®와 GYROTONIC®을 원래의 방식 그대로 가르칩니다. 한 사람에게 한 명의 강사가 온전히 집중하는 1:1 수업. 그렇게 얻은 힘과 유연함, 그리고 편안함은 수업이 끝난 뒤 일상까지 이어집니다.',
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
    eyebrow: '우리의 방식',
    title: ['더 많은 운동이 아니라,', '정확히', '맞는 운동'],
    titleAccentIndex: 1,
    body: '모든 것은 평가에서 시작됩니다. 기구를 잡기 전에, 먼저 척추의 가동 범위와 호흡 패턴, 좌우 불균형부터 꼼꼼히 살핍니다. 리포머의 저항과 자이로토닉의 나선형 움직임은 방식은 달라도 향하는 곳은 하나입니다 — 더 자유롭게 움직이는 몸.',
    caption: '로스앤젤레스 스튜디오',
  },
  programs: {
    eyebrow: '프로그램',
    title: ['모두를 위한,', '정성껏', '빚어낸 움직임'],
    titleAccentIndex: 1,
    body: '레벨에 상관없이 누구나. 필라테스와 자이로토닉®을 STOTT PILATES®·GYROTONIC® 국제 자격을 갖춘 강사진이 함께합니다.',
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
    title: ['GYROTONIC®', '공인 트레이너가', '되는 길'],
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
  instructors: {
    eyebrow: '강사진',
    title: ['국제 자격을 갖춘 네 명의', '전담', '강사'],
    titleAccentIndex: 1,
    body: '모든 강사는 GYROTONIC®과 STOTT PILATES® 국제 프로그램의 정식 자격을 갖추고 있습니다. 첫 평가를 함께한 강사가 마지막까지 곁을 지킵니다.',
    people: {
      sunnie: {
        name: 'Sunnie Lee',
        role: '마스터 레벨 강사',
        certs: ['GYROTONIC® 공인 프리트레이너', 'STOTT PILATES® 공인 강사'],
      },
      eunice: {
        name: 'Eunice Choi',
        role: 'STOTT PILATES® 공인 강사',
        certs: ['GYROTONIC® Level 1', 'Gyrokinesis', 'Archway', 'Jumping Stretching Board'],
      },
      soo: {
        name: 'Soo Kyoung Yi',
        role: 'STOTT PILATES® 공인 강사',
        certs: ['GYROTONIC® Level 1', 'Gyrokinesis', 'Archway', 'Jumping Stretching Board'],
      },
      haley: {
        name: 'Haley Kim',
        role: 'GYROTONIC® 강사',
        certs: ['GYROTONIC® Level 1', 'Jumping Stretching Board'],
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
        quote: '자이로토닉은 처음이었는데, 굳어 있던 어깨가 풀리는 느낌이 회차마다 달라요.',
        name: '서연우',
        meta: '자이로토닉 / 7개월째',
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
        meta: '자이로키네시스 매트 / 1년째',
      },
    },
  },
  schedule: {
    eyebrow: '수업 일정',
    title: ['시간을 고르면,', '자리는', '저희가 지킵니다'],
    titleAccentIndex: 1,
    body: '아래 일정표는 마인드바디 예약 시스템과 실시간으로 연결돼 있어요. 지금 보이는 자리가 바로 지금 예약할 수 있는 자리입니다. 원하는 수업을 골라 예약하면 끝!',
    note: '모든 시간은 미국 서부 시간(PT) 기준입니다.',
  },
  cta: {
    eyebrow: '첫 걸음',
    title: ['오늘부터, 다시', '자유롭게 움직여요'],
    body: '평가 한 번이면 충분합니다. 어디서 시작하면 좋을지, 무엇이 달라질 수 있을지 직접 확인해 보세요.',
    primary: '체험 수업 예약하기',
    secondary: '강사진 만나보기',
  },
  footer: {
    description:
      '리포머 필라테스와 자이로토닉으로 완성하는 움직임. 당신의 몸에 꼭 맞는 운동을 설계하는 로스앤젤레스의 스튜디오입니다.',
    address: ['672 S La Fayette Park Pl, STE 674, Los Angeles, CA 90057', '수업 시간은 위 실시간 일정표에서 확인하세요'],
    cols: {
      programs: {
        title: '프로그램',
        links: ['리포머 필라테스', '자이로토닉', '자이로키네시스 매트', '프라이빗 & 회복'],
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
