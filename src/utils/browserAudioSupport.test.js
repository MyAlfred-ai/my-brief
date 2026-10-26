/**
 * Qui sait partager le son de l'écran, et qui a besoin d'un périphérique
 * virtuel : la carte « Son de l'ordinateur » et la fenêtre « Navigateur
 * partiellement compatible » en dépendent.
 */
import { describe, it, expect } from 'vitest';
import { audioCaptureSupport } from './browserAudioSupport.js';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

describe('audioCaptureSupport', () => {
  it('Chrome et Edge sur ordinateur partagent le son de l’écran', () => {
    expect(audioCaptureSupport({ userAgent: UA.chromeWindows })).toEqual({
      desktop: true,
      shareAudio: true,
    });
    expect(audioCaptureSupport({ userAgent: UA.edgeMac }).shareAudio).toBe(true);
  });

  it('Firefox et Safari sur ordinateur : ordinateur, mais partage muet', () => {
    expect(audioCaptureSupport({ userAgent: UA.firefoxWindows })).toEqual({
      desktop: true,
      shareAudio: false,
    });
    expect(audioCaptureSupport({ userAgent: UA.safariMac })).toEqual({
      desktop: true,
      shareAudio: false,
    });
  });

  it('téléphone, tablette et application native : ni partage, ni son de l’ordinateur', () => {
    expect(audioCaptureSupport({ userAgent: UA.iphone, coarsePointer: true })).toEqual({
      desktop: false,
      shareAudio: false,
    });
    // Un iPad se présente comme un Mac : son pointeur tactile le trahit.
    expect(audioCaptureSupport({ userAgent: UA.safariMac, coarsePointer: true }).desktop).toBe(
      false,
    );
    // La WebView native se présente comme Safari ou Chrome : `native` tranche.
    expect(audioCaptureSupport({ userAgent: UA.chromeWindows, native: true })).toEqual({
      desktop: false,
      shareAudio: false,
    });
  });
});
