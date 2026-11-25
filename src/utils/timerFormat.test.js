import { describe, it, expect } from 'vitest';
import { timerClock, timerWords } from './timerFormat.js';

describe('timerFormat', () => {
  it('le compte à rebours : minutes et secondes, les heures seulement s’il y en a', () => {
    expect(timerClock(272)).toBe('4:32');
    expect(timerClock(7)).toBe('0:07');
    expect(timerClock(600)).toBe('10:00');
    expect(timerClock(3725)).toBe('1:02:05');
    expect(timerClock(0)).toBe('0:00');
  });

  it('une durée dite : la plus grande unité d’abord, sans zéro inutile', () => {
    expect(timerWords(300)).toBe('5 min');
    expect(timerWords(90)).toBe('1 min 30 s');
    expect(timerWords(45)).toBe('45 s');
    expect(timerWords(3600)).toBe('1 h');
    expect(timerWords(3900)).toBe('1 h 05 min');
  });

  it('une valeur absurde ne casse pas l’affichage', () => {
    expect(timerClock(-12)).toBe('0:00');
    expect(timerClock(undefined)).toBe('0:00');
    expect(timerWords(NaN)).toBe('0 s');
  });
});
