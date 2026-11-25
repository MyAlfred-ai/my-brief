/**
 * Mot d'appel de l'Aide IA : ce qui déclenche une question, et surtout ce qui
 * n'en déclenche pas — répondre à une phrase qui ne nous était pas adressée
 * est le défaut qui ferait couper la fonction.
 */
import { describe, it, expect } from 'vitest';
import {
  matchWakeWord,
  WAKE_QUESTION_MAX,
  wakeWordSpan,
  isDismissal,
  sizeRequest,
} from './wakeWord.js';

describe('matchWakeWord', () => {
  it('le prénom en tête de phrase ouvre une question', () => {
    expect(matchWakeWord('Alfred, rappelle-moi la date de livraison du lot 2 ?', 'Alfred')).toEqual(
      {
        kind: 'question',
        question: 'rappelle-moi la date de livraison du lot 2 ?',
      },
    );
  });

  it('sans virgule, sans majuscule, avec un accent parasite : la transcription varie', () => {
    for (const said of [
      'alfred rappelle moi la date de livraison',
      'ALFRED : rappelle moi la date de livraison',
      'Alfréd, rappelle moi la date de livraison',
    ]) {
      expect(matchWakeWord(said, 'Alfred')).toEqual({
        kind: 'question',
        question: 'rappelle moi la date de livraison',
      });
    }
  });

  it('une interjection peut précéder le prénom', () => {
    expect(matchWakeWord('Dis Alfred, où en est-on ?', 'Alfred')?.question).toBe('où en est-on ?');
    expect(matchWakeWord('Ok, Alfred, as-tu d’autres idées ?', 'Alfred')?.question).toBe(
      'as-tu d’autres idées ?',
    );
  });

  it('le prénom cité au milieu d’une phrase ne déclenche rien', () => {
    expect(matchWakeWord('J’en ai parlé à Alfred hier, il était d’accord.', 'Alfred')).toBeNull();
    expect(matchWakeWord('Le projet Alfred avance bien.', 'Alfred')).toBeNull();
    expect(matchWakeWord('Alfredo, tu peux fermer la porte ?', 'Alfred')).toBeNull();
  });

  it('une phrase plus loin dans le segment compte, et la suite précise la question', () => {
    expect(
      matchWakeWord('On avance. Alfred, rappelle-moi le budget. Celui du lot 2.', 'Alfred'),
    ).toEqual({ kind: 'question', question: 'rappelle-moi le budget. Celui du lot 2.' });
  });

  it('le prénom lancé seul arme l’écoute, sans question', () => {
    expect(matchWakeWord('Alfred ?', 'Alfred')).toEqual({ kind: 'armed' });
    expect(matchWakeWord('Alfred, euh…', 'Alfred')).toEqual({ kind: 'armed' });
  });

  it('un mot d’appel de plusieurs mots, réglé par l’administration', () => {
    expect(matchWakeWord('Cher assistant, résume la décision.', 'Cher Assistant')?.question).toBe(
      'résume la décision.',
    );
    expect(matchWakeWord('Cher ami, résume la décision.', 'Cher Assistant')).toBeNull();
  });

  it('sans mot d’appel réglé, rien ne déclenche', () => {
    expect(matchWakeWord('Alfred, une question ?', '')).toBeNull();
    expect(matchWakeWord('Alfred, une question ?', '   ')).toBeNull();
  });

  it('une question dictée sans fin est coupée', () => {
    const long = `Alfred, ${'mot '.repeat(300)}`;
    expect(matchWakeWord(long, 'Alfred')?.question.length).toBe(WAKE_QUESTION_MAX);
  });
});

describe('wakeWordSpan — où écrire le prénom dans la teinte de l’IA', () => {
  const marked = (text, word = 'Alfred') => {
    const span = wakeWordSpan(text, word);
    return span ? text.slice(span.start, span.end) : null;
  };

  it('le prénom seul, sans la ponctuation qui le touche', () => {
    expect(marked('Alfred, rappelle-moi la date de livraison ?')).toBe('Alfred');
    expect(marked('Alfred ?')).toBe('Alfred');
    expect(marked('Alfred… tu es là ?')).toBe('Alfred');
  });

  it('tel que la transcription l’a écrit, casse et accents compris', () => {
    expect(marked('dis alfréd, où en est-on ?')).toBe('alfréd');
    expect(wakeWordSpan('dis alfréd, où en est-on ?', 'Alfred')).toEqual({ start: 4, end: 10 });
  });

  it('dans la phrase qu’il ouvre, même si ce n’est pas la première du segment', () => {
    const text = 'On avance bien. Alfred, tu confirmes ?';
    expect(wakeWordSpan(text, 'Alfred')).toEqual({ start: 16, end: 22 });
  });

  it('un mot d’appel de plusieurs mots est marqué d’un bloc', () => {
    expect(marked('Cher assistant, résume la décision.', 'Cher Assistant')).toBe('Cher assistant');
  });

  it('cité au milieu d’une phrase, ou sans mot d’appel réglé : rien à marquer', () => {
    expect(wakeWordSpan('J’en ai parlé à Alfred hier.', 'Alfred')).toBeNull();
    expect(wakeWordSpan('Alfred, une question ?', '')).toBeNull();
  });

  it('ce qui est marqué est exactement ce qui déclenche', () => {
    for (const text of ['Alfred ?', 'Ok Alfred, le budget ?', 'Merci Alfred.', 'Alfredo arrive.']) {
      expect(!!wakeWordSpan(text, 'Alfred')).toBe(!!matchWakeWord(text, 'Alfred'));
    }
  });
});

describe('isDismissal — « ferme », « merci » : un geste, pas une question', () => {
  it('reconnaît une phrase qui ne dit que cela', () => {
    for (const said of [
      'ferme',
      'Ferme la fenêtre.',
      'ferme-toi',
      'masque ta carte',
      'range ça',
      'merci',
      'Merci beaucoup !',
      'c’est bon, merci',
      'close',
      'thank you',
    ]) {
      expect(isDismissal(said), said).toBe(true);
    }
  });

  it('laisse au modèle tout ce qui en dit plus', () => {
    for (const said of [
      'ferme le dossier Atlas dans le plan',
      'merci de me rappeler la date de livraison',
      'peux-tu fermer le ticket ?',
      'rappelle-moi la date',
      '',
    ]) {
      expect(isDismissal(said), said).toBe(false);
    }
  });
});

describe('sizeRequest — « agrandis », « plus petit » : régler la taille de sa fenêtre', () => {
  it('reconnaît les deux sens, avec ou sans ce sur quoi ça porte', () => {
    for (const said of [
      'agrandis',
      'Agrandis la fenêtre.',
      'agrandis le texte',
      'agrandis encore un peu',
      'plus grand',
      'écris plus gros',
      'zoome',
      'bigger',
    ]) {
      expect(sizeRequest(said), said).toBe('up');
    }
    for (const said of [
      'réduis',
      'Réduis la fenêtre',
      'plus petit',
      'diminue la taille',
      'smaller',
    ]) {
      expect(sizeRequest(said), said).toBe('down');
    }
  });

  it('laisse au modèle une phrase qui parle d’autre chose', () => {
    for (const said of [
      'agrandis le périmètre du lot 2',
      'réduis le budget de moitié',
      'le lot est plus grand que prévu, non ?',
      'rappelle-moi la date',
      '',
    ]) {
      expect(sizeRequest(said), said).toBeNull();
    }
  });
});

describe('le prénom tel que la transcription l’écorche', () => {
  it('« Alfrède », « Halfred », « Alfed », « Al Fred » : c’est bien lui qu’on appelle', () => {
    for (const said of [
      'Alfrède, où en est le budget ?',
      'Halfred, où en est le budget ?',
      'Alfed où en est le budget ?',
      'Al Fred, où en est le budget ?',
      'Al-Fred, où en est le budget ?',
      'Alfraid, où en est le budget ?',
    ]) {
      expect(matchWakeWord(said, 'Alfred'), said).toEqual({
        kind: 'question',
        question: 'où en est le budget ?',
      });
    }
  });

  it('le prénom coloré est celui qui a été entendu, coupé en deux ou non', () => {
    const cut = 'Al Fred, où en est le budget ?';
    const span = wakeWordSpan(cut, 'Alfred');
    expect(cut.slice(span.start, span.end)).toBe('Al Fred');
    const odd = 'Dis, Alfrède, tu es là ?';
    const other = wakeWordSpan(odd, 'Alfred');
    expect(odd.slice(other.start, other.end)).toBe('Alfrède');
  });

  it('un autre mot en tête de phrase ne déclenche toujours rien', () => {
    for (const said of [
      'Alfredo, tu peux fermer la porte ?',
      'Albert, tu as le dossier ?',
      'Alors, où en est-on ?',
      'Al, tu viens ?',
    ]) {
      expect(matchWakeWord(said, 'Alfred'), said).toBeNull();
    }
  });

  it('une salutation peut précéder le prénom', () => {
    expect(matchWakeWord('Bonjour Alfred, quel est l’ordre du jour ?', 'Alfred')?.question).toBe(
      'quel est l’ordre du jour ?',
    );
  });
});

describe('le prénom qui FERME la phrase, après une virgule', () => {
  it('« tu en penses quoi, Alfred ? » : la phrase qu’il ferme est la question', () => {
    expect(matchWakeWord('Tu en penses quoi, Alfred ?', 'Alfred')).toEqual({
      kind: 'question',
      question: 'Tu en penses quoi ?',
    });
    expect(matchWakeWord('On a fini. Rappelle-nous les actions, Alfred.', 'Alfred')).toEqual({
      kind: 'question',
      question: 'Rappelle-nous les actions',
    });
  });

  it('sans la virgule d’une adresse, ou sur trois mots : une conversation, pas un appel', () => {
    for (const said of [
      'J’en ai parlé à Alfred.',
      'Tu connais le projet Alfred ?',
      'On est chez My Alfred.',
      'Oui, Alfred.',
    ]) {
      expect(matchWakeWord(said, 'Alfred'), said).toBeNull();
    }
  });

  it('« Merci Alfred » est un congé, virgule ou non', () => {
    for (const said of ['Merci Alfred.', 'Merci, Alfred.', 'Ok merci Alfred']) {
      const call = matchWakeWord(said, 'Alfred');
      expect(call?.kind, said).toBe('question');
      expect(isDismissal(call.question), said).toBe(true);
    }
  });

  it('le prénom se colore là où il est', () => {
    const text = 'Tu en penses quoi, Alfred ?';
    const span = wakeWordSpan(text, 'Alfred');
    expect(text.slice(span.start, span.end)).toBe('Alfred');
  });
});
