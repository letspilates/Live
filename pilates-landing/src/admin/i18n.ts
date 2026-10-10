// EN / KR strings for the admin portal. The language choice is shared with
// the public site (same storage key), so staff keep the language they picked.
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'ko';

const STORAGE_KEY = 'reforme-lang';

const en = {
  loading: 'Loading',
  staging: 'Staging',
  // sign in
  email: 'Email',
  password: 'Password',
  show: 'Show',
  hide: 'Hide',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  forgotPassword: 'Forgot password?',
  badCredentials: 'Email or password is incorrect.',
  tooManyAttempts: 'Too many attempts. Wait a minute and try again.',
  networkError: 'Could not reach the server. Check your connection and try again.',
  sessionEnded: 'Your session ended. Please sign in again.',
  resetTitle: 'Reset password',
  resetBody: 'Enter your email. If it belongs to a staff account, we will send a link to set a new password.',
  sendLink: 'Send link',
  sending: 'Sending…',
  resetSent: 'If that email belongs to a staff account, a reset link is on its way.',
  backToSignIn: 'Back to sign in',
  // set password
  welcomeSetPassword: 'Welcome. Set your password',
  newPasswordTitle: 'Set a new password',
  newPassword: 'New password',
  confirmPassword: 'Confirm password',
  passwordHint: 'At least 8 characters.',
  passwordTooShort: 'Use at least 8 characters.',
  passwordMismatch: 'The passwords do not match.',
  savePassword: 'Save password',
  saving: 'Saving…',
  linkExpired:
    'This link has expired or was already used. Ask the owner to resend your invitation, or request a new reset link.',
  openEmailLink: 'Open the link from your email to set a password.',
  // access
  notConfigured: 'The admin portal is not connected on this site yet.',
  noAccessTitle: 'No portal access',
  noAccessBody: 'This account is not set up for the studio portal. Ask the owner for an invitation.',
  inactiveTitle: 'Account inactive',
  inactiveBody: 'Your access has been turned off. Contact the studio owner.',
  signOut: 'Sign out',
  // layout
  menu: 'Menu',
  closeMenu: 'Close menu',
  collapse: 'Collapse',
  expand: 'Expand',
  navDashboard: 'Dashboard',
  navEnrollments: 'Enrollments',
  navStaff: 'Staff',
  navAccount: 'My account',
  accountMenu: 'Account menu',
  OWNER: 'Owner',
  INSTRUCTOR: 'Instructor',
  STAFF: 'Staff',
  // dashboard
  goodMorning: 'Good morning',
  goodAfternoon: 'Good afternoon',
  goodEvening: 'Good evening',
  team: 'Team',
  activeCount: 'active',
  invitedCount: 'invited',
  inactiveCount: 'inactive',
  manageStaff: 'Manage staff',
  instructorSoon: 'Recording payments will open here soon.',
  enrollmentsCardBody: 'Training course sign-ups and course editing.',
  openEnrollments: 'Open enrollments',
  myProfile: 'My profile',
  // enrollments
  enrollmentsNote:
    'This is the existing enrollment screen. It still reads the Google Sheet and asks for the studio admin password.',
  openInNewTab: 'Open in a new tab',
  enrollmentsFrame: 'Enrollment management',
  // staff
  fullName: 'Full name',
  role: 'Role',
  tier: 'Pricing tier',
  lastSignIn: 'Last sign-in',
  never: 'Never',
  you: 'You',
  ACTIVE: 'Active',
  INVITED: 'Invited',
  INACTIVE: 'Inactive',
  CERTIFIED: 'Certified',
  MASTER: 'Master',
  tierNotSet: 'Not set',
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  cancel: 'Cancel',
  confirm: 'Confirm',
  enterName: 'Enter a name.',
  enterEmail: 'Enter a valid email address.',
  noInstructors: 'No instructors yet. Add your first instructor.',
  addStaff: 'Add staff',
  addStaffNote: 'Creates their sign-in and portal access in one step. No email is sent: give them the email and password yourself.',
  staffAdded: '{name} can now sign in to the portal.',
  alreadyStaff: 'This person is already on the staff list.',
  staffLinked: '{name} already had a login, so it was linked. Their existing password is unchanged.',
  firstPassword: 'First password',
  firstPasswordHint: 'At least 8 characters. They can change it in My account.',
  confirmDeactivate: 'Deactivate {name}? They lose access right away. Their past records stay.',
  confirmReactivate: 'Reactivate {name}? They can sign in again.',
  confirmMakeOwner: 'Make {name} an owner? Owners see all finances and manage staff.',
  confirmChangeRole: 'Change {name} to {role}? They will not see studio finances or manage staff.',
  deactivated: '{name} is deactivated.',
  reactivated: '{name} is active again.',
  roleUpdated: 'Role updated.',
  somethingWrong: 'Something went wrong. Try again.',
  tryAgain: 'Try again',
  // account
  myAccount: 'My account',
  profile: 'Profile',
  saveName: 'Save name',
  nameSaved: 'Name saved.',
  language: 'Language',
  changePassword: 'Change password',
  passwordUpdated: 'Password updated.',
};

type Dict = typeof en;

const ko: Dict = {
  loading: '불러오는 중',
  staging: '스테이징',
  email: '이메일',
  password: '비밀번호',
  show: '보기',
  hide: '숨기기',
  signIn: '로그인',
  signingIn: '로그인 중…',
  forgotPassword: '비밀번호를 잊으셨나요?',
  badCredentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  tooManyAttempts: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
  networkError: '서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도하세요.',
  sessionEnded: '세션이 끝났습니다. 다시 로그인하세요.',
  resetTitle: '비밀번호 재설정',
  resetBody: '이메일을 입력하세요. 직원 계정이면 새 비밀번호를 설정할 링크를 보내드립니다.',
  sendLink: '링크 보내기',
  sending: '보내는 중…',
  resetSent: '직원 계정의 이메일이라면 재설정 링크가 발송되었습니다.',
  backToSignIn: '로그인으로 돌아가기',
  welcomeSetPassword: '환영합니다. 비밀번호를 설정하세요',
  newPasswordTitle: '새 비밀번호 설정',
  newPassword: '새 비밀번호',
  confirmPassword: '비밀번호 확인',
  passwordHint: '8자 이상.',
  passwordTooShort: '8자 이상 입력하세요.',
  passwordMismatch: '비밀번호가 서로 다릅니다.',
  savePassword: '비밀번호 저장',
  saving: '저장 중…',
  linkExpired:
    '링크가 만료되었거나 이미 사용되었습니다. 오너에게 초대를 다시 보내달라고 하거나 재설정 링크를 다시 요청하세요.',
  openEmailLink: '이메일로 받은 링크를 열어 비밀번호를 설정하세요.',
  notConfigured: '이 사이트에는 아직 관리자 포털이 연결되지 않았습니다.',
  noAccessTitle: '포털 접근 권한 없음',
  noAccessBody: '이 계정은 스튜디오 포털에 등록되어 있지 않습니다. 오너에게 초대를 요청하세요.',
  inactiveTitle: '비활성 계정',
  inactiveBody: '접근 권한이 해제되었습니다. 스튜디오 오너에게 문의하세요.',
  signOut: '로그아웃',
  menu: '메뉴',
  closeMenu: '메뉴 닫기',
  collapse: '접기',
  expand: '펼치기',
  navDashboard: '대시보드',
  navEnrollments: '등록 관리',
  navStaff: '직원',
  navAccount: '내 계정',
  accountMenu: '계정 메뉴',
  OWNER: '오너',
  INSTRUCTOR: '강사',
  STAFF: '스태프',
  goodMorning: '좋은 아침입니다',
  goodAfternoon: '안녕하세요',
  goodEvening: '좋은 저녁입니다',
  team: '팀',
  activeCount: '활성',
  invitedCount: '초대 중',
  inactiveCount: '비활성',
  manageStaff: '직원 관리',
  instructorSoon: '결제 기록 기능이 곧 이곳에 열립니다.',
  enrollmentsCardBody: '지도자 과정 신청자 확인과 코스 편집.',
  openEnrollments: '등록 관리 열기',
  myProfile: '내 정보',
  enrollmentsNote: '기존 등록 관리 화면입니다. 지금은 구글 시트를 그대로 읽고, 기존 관리자 비밀번호를 한 번 묻습니다.',
  openInNewTab: '새 탭에서 열기',
  enrollmentsFrame: '등록 관리',
  fullName: '이름',
  role: '역할',
  tier: '가격 등급',
  lastSignIn: '최근 로그인',
  never: '없음',
  you: '나',
  ACTIVE: '활성',
  INVITED: '초대 중',
  INACTIVE: '비활성',
  CERTIFIED: 'Certified',
  MASTER: 'Master',
  tierNotSet: '미지정',
  deactivate: '비활성화',
  reactivate: '다시 활성화',
  cancel: '취소',
  confirm: '확인',
  enterName: '이름을 입력하세요.',
  enterEmail: '올바른 이메일을 입력하세요.',
  noInstructors: '아직 강사가 없습니다. 첫 강사를 추가하세요.',
  addStaff: '직원 추가',
  addStaffNote: '로그인 계정과 포털 권한을 한 번에 만듭니다. 메일은 보내지 않으니 이메일과 비밀번호를 직접 알려 주세요.',
  staffAdded: '{name} 님이 이제 포털에 로그인할 수 있습니다.',
  alreadyStaff: '이미 직원 목록에 있는 사람입니다.',
  staffLinked: '{name} 님은 이미 로그인 계정이 있어 그대로 연결했습니다. 기존 비밀번호는 바뀌지 않습니다.',
  firstPassword: '처음 비밀번호',
  firstPasswordHint: '8자 이상. 본인이 내 계정에서 바꿀 수 있습니다.',
  confirmDeactivate: '{name} 님을 비활성화할까요? 즉시 접근이 막히고, 지난 기록은 그대로 남습니다.',
  confirmReactivate: '{name} 님을 다시 활성화할까요? 다시 로그인할 수 있게 됩니다.',
  confirmMakeOwner: '{name} 님을 오너로 지정할까요? 오너는 모든 재무 정보를 보고 직원을 관리합니다.',
  confirmChangeRole: '{name} 님을 {role}(으)로 변경할까요? 스튜디오 재무와 직원 관리는 볼 수 없습니다.',
  deactivated: '{name} 님을 비활성화했습니다.',
  reactivated: '{name} 님을 다시 활성화했습니다.',
  roleUpdated: '역할을 변경했습니다.',
  somethingWrong: '문제가 생겼습니다. 다시 시도하세요.',
  tryAgain: '다시 시도',
  myAccount: '내 계정',
  profile: '프로필',
  saveName: '이름 저장',
  nameSaved: '이름을 저장했습니다.',
  language: '언어',
  changePassword: '비밀번호 변경',
  passwordUpdated: '비밀번호를 변경했습니다.',
};

export type TextKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { en, ko };
const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'ko' ? 'ko' : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** t('key') or t('key', { name }) for strings with {placeholders}. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, readLang);
  const t = (key: TextKey, vars?: Record<string, string>) =>
    vars
      ? DICTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
      : DICTS[lang][key];
  return { t, lang };
}
