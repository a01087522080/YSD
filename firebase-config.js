/**
 * Firebase Realtime Database 설정 파일.
 *
 * 아직 실제 Firebase 프로젝트가 연결되지 않아 자리표시자 값으로 두었습니다.
 * Firebase 콘솔에서 웹 앱을 만들고 아래 값을 채운 뒤 isConfigured 를 true 로 바꾸면
 * 앱이 자동으로 실시간 모드로 전환됩니다. (index.html 수정은 필요 없습니다.)
 *
 * 필요한 순서
 *  1) https://console.firebase.google.com 에서 프로젝트 생성
 *  2) 빌드 > Realtime Database 만들기 (위치 예: asia-southeast1)
 *  3) Realtime Database > 규칙에서 rooms 이하 읽기/쓰기 허용
 *     {
 *       "rules": { "rooms": { "$room": { ".read": true, ".write": true } } }
 *     }
 *  4) 프로젝트 설정 > 내 앱 > 웹 앱 추가 → 아래 firebaseConfig 값 복사
 *  5) databaseURL 확인 (Realtime Database 화면 상단의 URL)
 *  6) isConfigured = true 로 변경 후 저장
 */

export const isConfigured = false;

/** 비서실(방) 구분자. 같은 값을 쓰는 피클들이 같은 방을 봅니다. */
export const roomId = 'joint-office';

/** 화면에 보이는 방 이름 */
export const roomName = '우리들의 작업실';

export const firebaseConfig = {
  apiKey: 'PASTE_YOUR_API_KEY',
  authDomain: 'PASTE_YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'PASTE_YOUR_PROJECT',
  storageBucket: 'PASTE_YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'PASTE_YOUR_SENDER_ID',
  appId: 'PASTE_YOUR_APP_ID',
};

/** 설정이 실제로 채워졌는지 한 번 더 확인한다. */
export function isFirebaseReady() {
  if (!isConfigured) return false;
  const values = Object.keys(firebaseConfig).map(function (key) {
    return String(firebaseConfig[key] || '');
  });
  return values.every(function (v) {
    return v.length > 0 && v.indexOf('PASTE_') === -1;
  });
}
