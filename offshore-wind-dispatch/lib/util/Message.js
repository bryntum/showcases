import { StringHelper, Toast } from '@bryntum/core-enterprise';

/**
 * A short message as a Toast: why a change was refused or taken back, or what was booked. Encoded, the reasons come
 * from the plan
 * @param {String} text
 */
export function tell(text) {
    Toast.show({ html : StringHelper.encodeHtml(text), cls : 'ow-toast-message' });
}
