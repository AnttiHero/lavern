/**
 * useUserProfile — Unit tests for localStorage-backed profile persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserProfile } from '../my-page/hooks/useUserProfile.js';

const STORAGE_KEY = 'shem-user-profile';

beforeEach(() => {
  localStorage.clear();
});

describe('useUserProfile', () => {
  it('returns default profile when localStorage is empty', () => {
    const { result } = renderHook(() => useUserProfile());
    expect(result.current.profile.displayName).toBe('');
    expect(result.current.profile.defaultWorkflowId).toBe('counsel');
    expect(result.current.profile.defaultIntensity).toBe('standard');
    expect(result.current.profile.defaultBudgetUsd).toBe(10);
    expect(result.current.profile.yoloModeDefault).toBe(false);
    expect(result.current.profile.customInstructions).toBe('');
    expect(result.current.profile.savedTeams).toEqual([]);
  });

  it('saves and reads profile from localStorage', () => {
    const { result } = renderHook(() => useUserProfile());

    act(() => {
      result.current.updateProfile({ displayName: 'Ada' });
    });

    expect(result.current.profile.displayName).toBe('Ada');

    // Verify it's in localStorage
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.displayName).toBe('Ada');
  });

  it('merges partial updates without losing other fields', () => {
    const { result } = renderHook(() => useUserProfile());

    act(() => {
      result.current.updateProfile({ displayName: 'Ada', firmName: 'Acme Law' });
    });
    act(() => {
      result.current.updateProfile({ firmName: 'Better Law' });
    });

    expect(result.current.profile.displayName).toBe('Ada');
    expect(result.current.profile.firmName).toBe('Better Law');
    expect(result.current.profile.defaultWorkflowId).toBe('counsel');
  });

  it('adds a team via saveTeam', () => {
    const { result } = renderHook(() => useUserProfile());

    act(() => {
      result.current.saveTeam({
        name: 'Privacy Squad',
        description: 'For GDPR matters',
        roles: ['privacy-counsel', 'ethics-auditor'],
        teamSize: 2,
      });
    });

    expect(result.current.profile.savedTeams).toHaveLength(1);
    expect(result.current.profile.savedTeams[0].name).toBe('Privacy Squad');
    expect(result.current.profile.savedTeams[0].roles).toEqual(['privacy-counsel', 'ethics-auditor']);
    expect(result.current.profile.savedTeams[0].id).toMatch(/^team-/);
  });

  it('removes a team via deleteTeam', () => {
    const { result } = renderHook(() => useUserProfile());

    act(() => {
      result.current.saveTeam({
        name: 'Team A',
        description: '',
        roles: ['a'],
        teamSize: 1,
      });
    });

    const teamId = result.current.profile.savedTeams[0].id;

    act(() => {
      result.current.deleteTeam(teamId);
    });

    expect(result.current.profile.savedTeams).toHaveLength(0);
  });

  it('hasSavedTeams reflects saved teams state', () => {
    const { result } = renderHook(() => useUserProfile());

    expect(result.current.hasSavedTeams).toBe(false);

    act(() => {
      result.current.saveTeam({
        name: 'Test Team',
        description: '',
        roles: ['a'],
        teamSize: 1,
      });
    });

    expect(result.current.hasSavedTeams).toBe(true);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, '{{{invalid json');

    const { result } = renderHook(() => useUserProfile());
    expect(result.current.profile.displayName).toBe('');
    expect(result.current.profile.defaultWorkflowId).toBe('counsel');
    expect(result.current.profile.savedTeams).toEqual([]);
  });

  it('preserves custom instructions across updates', () => {
    const { result } = renderHook(() => useUserProfile());

    act(() => {
      result.current.updateProfile({ customInstructions: 'Always cite GDPR Article 5.' });
    });
    act(() => {
      result.current.updateProfile({ displayName: 'Updated Name' });
    });

    expect(result.current.profile.customInstructions).toBe('Always cite GDPR Article 5.');
    expect(result.current.profile.displayName).toBe('Updated Name');
  });
});
