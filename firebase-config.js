/**
 * Firebase Realtime Database 설정 파일.
 *
 * 실제 Firebase 프로젝트(pickle-joint-office-2e827)에 연결되어 있습니다.
 * isConfigured 가 true 이고 아래 값이 모두 채워져 있으면 앱이 실시간 모드로 동작합니다.
 * (index.html 수정은 필요 없습니다.)
 *
 * ※ Realtime Database 규칙은 테스트 모드(2026-12-27 만료)로 열려 있습니다.
 *    만료 전에 규칙을 rooms 이하만 허용하도록 바꿔 주세요.
 *     {
 *       "rules": { "rooms": { "$room": { ".read": true, ".write": true } } }
 *     }
 */

export const isConfigured = true;

/** 비서실(방) 구분자. 같은 값을 쓰는 피클들이 같은 방을 봅니다. */
export const roomId = 'joint-office';

/** 화면에 보이는 방 이름 */
export const roomName = '우리들의 작업실';

export const firebaseConfig = {
  apiKey: 'AIzaSyAXx3-iOZhvB_X1d4Rcp4InY13BKZXMnMg',
  authDomain: 'pickle-joint-office-2e827.firebaseapp.com',
  databaseURL: 'https://pickle-joint-office-2e827-default-rtdb.firebaseio.com',
  projectId: 'pickle-joint-office-2e827',
  storageBucket: 'pickle-joint-office-2e827.firebasestorage.app',
  messagingSenderId: '163828611992',
  appId: '1:163828611992:web:99c867e690a609792fc9ed',
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
