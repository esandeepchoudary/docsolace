import { describe, expect, it } from 'vitest';
import { isDestructiveControl, isSensitiveField, syntheticValueFor } from '../synthetic-data.mjs';

describe('isSensitiveField', () => {
  it('flags a password-typed field regardless of its name', () => {
    expect(isSensitiveField('New value', 'password')).toBe(true);
  });

  it('flags SSN/payment/government-id-like names', () => {
    expect(isSensitiveField('SSN', 'text')).toBe(true);
    expect(isSensitiveField('Social Security Number', 'text')).toBe(true);
    expect(isSensitiveField('Card number', 'text')).toBe(true);
    expect(isSensitiveField('CVV', 'text')).toBe(true);
    expect(isSensitiveField('Bank account number', 'text')).toBe(true);
    expect(isSensitiveField('API Key', 'text')).toBe(true);
    expect(isSensitiveField('Passport number', 'text')).toBe(true);
  });

  it('does not flag an ordinary field', () => {
    expect(isSensitiveField('Full name', 'text')).toBe(false);
    expect(isSensitiveField('Email', 'email')).toBe(false);
    expect(isSensitiveField('', 'text')).toBe(false);
    expect(isSensitiveField(undefined, undefined)).toBe(false);
  });
});

describe('isDestructiveControl', () => {
  it('flags destructive verbs as whole words', () => {
    expect(isDestructiveControl('Delete account')).toBe(true);
    expect(isDestructiveControl('Remove item')).toBe(true);
    expect(isDestructiveControl('Pay now')).toBe(true);
    expect(isDestructiveControl('Send')).toBe(true);
    expect(isDestructiveControl('Log out')).toBe(true);
    expect(isDestructiveControl('Sign out')).toBe(true);
    expect(isDestructiveControl('Unsubscribe')).toBe(true);
  });

  it('does not flag a word that merely contains a destructive substring', () => {
    expect(isDestructiveControl('Sender preferences')).toBe(false);
    expect(isDestructiveControl('Removable media settings')).toBe(false);
  });

  it('does not flag an ordinary safe control', () => {
    expect(isDestructiveControl('Search')).toBe(false);
    expect(isDestructiveControl('Show more')).toBe(false);
    expect(isDestructiveControl(undefined)).toBe(false);
  });
});

describe('syntheticValueFor', () => {
  it('returns the reserved fictional conventions for known field kinds', () => {
    expect(syntheticValueFor('Email address')).toBe('user@example.com');
    expect(syntheticValueFor('Phone number')).toBe('555-0100');
    expect(syntheticValueFor('Street Address')).toBe('123 Example Street');
    expect(syntheticValueFor('Date of birth')).toBe('2020-01-01');
    expect(syntheticValueFor('Full name')).toBe('Test User');
  });

  it('falls back to a generic placeholder for an unrecognized field', () => {
    expect(syntheticValueFor('Favorite color')).toBe('Example value');
    expect(syntheticValueFor(undefined)).toBe('Example value');
  });
});
