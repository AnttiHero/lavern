/**
 * usePartnerDemo -- Scripted partner conversation for demo mode.
 *
 * Plays a pre-written conversation between Catherine and a hypothetical
 * client, with typewriter text effects and simulated voice orb animation.
 * Supports multiple demo cases selected via sessionStorage.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, PartnerRecommendation } from './usePartnerConsult.js';

// ── Types ────────────────────────────────────────────────────────────

type DemoStep =
  | { type: 'assistant'; text: string; delay: number }
  | { type: 'user'; text: string; delay: number }
  | { type: 'finalize'; recommendation: PartnerRecommendation; delay: number };

export type DemoCaseId = 'heartconnect' | 'healthprivacy' | 'devcontract';

// ── Per-case scripts ─────────────────────────────────────────────────

function buildHeartConnectScript(): DemoStep[] {
  return [
    {
      type: 'assistant',
      text: "Good afternoon. I'm Catherine Blackwell. What can I help you with today?",
      delay: 500,
    },
    {
      type: 'user',
      text: 'We just launched HeartConnect, a dating platform. We need proper Terms of Service before we scale.',
      delay: 2500,
    },
    {
      type: 'assistant',
      text: 'Dating platforms carry unique regulatory exposure. Are you handling user data in the EU, and do you have age verification in place?',
      delay: 2500,
    },
    {
      type: 'user',
      text: "Yes, we're live in the EU and US. We verify age at signup but our current terms were drafted by our CTO, not a lawyer.",
      delay: 2500,
    },
    {
      type: 'assistant',
      text: "That's exactly the kind of risk we specialize in. GDPR consent, user safety provisions, content moderation liability. Let me assemble the right team.",
      delay: 2500,
    },
    {
      type: 'finalize',
      delay: 2000,
      recommendation: {
        workflowId: 'review',
        requestType: 'contract_review',
        intensity: 'standard',
        budgetUsd: 12,
        teamRoles: [
          'managing-partner',
          'consumer-rights-specialist',
          'privacy-counsel',
          'regulatory-counsel',
          'plain-language-specialist',
          'risk-pricer',
          'junior-associate',
        ],
        briefingMemo:
          'Client operates HeartConnect, a consumer dating platform active in the US and EU. The current Terms of Service were drafted internally without legal counsel.\n\nKey areas requiring specialist attention:\n1. GDPR consent architecture and data subject rights for EU users\n2. Age verification compliance and minor protection provisions\n3. User safety obligations, content moderation, and platform liability\n4. Arbitration clause and class action waiver enforceability across jurisdictions\n5. User-generated content licensing and takedown procedures\n\nRecommend a focused contract review with seven specialists to cover consumer protection, privacy regulation, and plain-language transformation.',
        reasoning:
          'Consumer-facing platform with cross-border regulatory exposure requires privacy counsel, regulatory counsel, and consumer rights specialists. The non-professional draft increases the likelihood of material gaps in liability protection and regulatory compliance.',
      },
    },
  ];
}

function buildHealthPrivacyScript(): DemoStep[] {
  return [
    {
      type: 'assistant',
      text: "Good afternoon. I'm Catherine Blackwell. What can I help you with today?",
      delay: 500,
    },
    {
      type: 'user',
      text: "I'm the CEO of MediVault. We need our privacy policy reviewed before our Series B due diligence.",
      delay: 2500,
    },
    {
      type: 'assistant',
      text: 'Health data is among the most heavily regulated. Are you subject to HIPAA, and do you transfer data across borders?',
      delay: 2500,
    },
    {
      type: 'user',
      text: 'Yes to both. We store patient records for US clinics but our engineering team is in Berlin. Investors are asking about our data governance.',
      delay: 2500,
    },
    {
      type: 'assistant',
      text: 'Cross-border health data with HIPAA and GDPR overlap. This is exactly where gaps hide. Let me put together a specialist team for you.',
      delay: 2500,
    },
    {
      type: 'finalize',
      delay: 2000,
      recommendation: {
        workflowId: 'review',
        requestType: 'contract_review',
        intensity: 'standard',
        budgetUsd: 15,
        teamRoles: [
          'managing-partner',
          'privacy-counsel',
          'regulatory-counsel',
          'compliance-officer',
          'plain-language-specialist',
          'risk-pricer',
        ],
        briefingMemo:
          'Client is MediVault, a health technology company storing patient records for US medical providers. Engineering operations are based in Berlin, creating a cross-border data transfer scenario.\n\nKey areas requiring specialist attention:\n1. HIPAA compliance: Business Associate Agreement obligations, PHI safeguards, breach notification\n2. GDPR compliance: Legal basis for processing health data (Article 9), Data Protection Impact Assessment\n3. Cross-border transfer mechanisms: US-EU data flows, Standard Contractual Clauses, adequacy decisions\n4. Data retention and deletion policies for medical records\n5. Breach notification timelines under both HIPAA (60 days) and GDPR (72 hours)\n\nSeries B due diligence context increases urgency. Investors will scrutinize data governance as a material risk factor.',
        reasoning:
          'Dual-jurisdiction health data processing requires deep privacy and regulatory expertise. The HIPAA-GDPR intersection is a known compliance minefield, and the Series B context means the privacy policy will face investor scrutiny.',
      },
    },
  ];
}

function buildDevContractScript(): DemoStep[] {
  return [
    {
      type: 'assistant',
      text: "Good afternoon. I'm Catherine Blackwell. What can I help you with today?",
      delay: 500,
    },
    {
      type: 'user',
      text: "I'm CTO at CodeCraft. We're hiring freelance developers and need a solid contractor agreement.",
      delay: 2500,
    },
    {
      type: 'assistant',
      text: 'Freelance developer agreements are deceptively tricky. IP assignment, work-for-hire doctrine, and misclassification risk are the big three. What concerns you most?',
      delay: 2500,
    },
    {
      type: 'user',
      text: "Mostly IP ownership. We had a contractor claim ownership of code they wrote for us last year. We can't let that happen again.",
      delay: 2500,
    },
    {
      type: 'assistant',
      text: "A prior IP dispute makes this high priority. We'll need to lock down assignment clauses, pre-existing IP carve-outs, and work product definitions. Let me build your team.",
      delay: 2500,
    },
    {
      type: 'finalize',
      delay: 2000,
      recommendation: {
        workflowId: 'review',
        requestType: 'contract_review',
        intensity: 'standard',
        budgetUsd: 10,
        teamRoles: [
          'managing-partner',
          'contract-specialist',
          'ip-specialist',
          'employment-counsel',
          'plain-language-specialist',
          'risk-pricer',
        ],
        briefingMemo:
          'Client is CodeCraft, a technology company engaging freelance software developers. A prior IP ownership dispute with a contractor has made robust IP provisions a critical requirement.\n\nKey areas requiring specialist attention:\n1. IP assignment vs. work-for-hire: Ensuring all work product vests in the company, with proper assignment language for jurisdictions where work-for-hire does not apply to independent contractors\n2. Pre-existing IP carve-outs and open source contribution policies\n3. Worker misclassification risk: Control tests, economic reality factors, safe harbor provisions\n4. Termination provisions: Notice periods, transition obligations, code handover requirements\n5. Liability cap and indemnification for defective deliverables\n6. Confidentiality and non-compete enforceability for contractors\n\nPrior IP dispute context elevates the importance of airtight assignment language and clear work product definitions.',
        reasoning:
          'IP ownership disputes are among the most expensive litigation risks for tech companies. The prior incident justifies specialist attention from an IP specialist and employment counsel to prevent misclassification exposure.',
      },
    },
  ];
}

const SCRIPTS: Record<DemoCaseId, () => DemoStep[]> = {
  heartconnect: buildHeartConnectScript,
  healthprivacy: buildHealthPrivacyScript,
  devcontract: buildDevContractScript,
};

const CHAR_DELAY = 25; // ms per character for typewriter effect
const FAKE_AUDIO_INTERVAL = 80; // ms between fake audio level updates

// ── Hook ─────────────────────────────────────────────────────────────

export function usePartnerDemo(enabled: boolean) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [recommendation, setRecommendation] = useState<PartnerRecommendation | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);
  const [fakeAudioLevel, setFakeAudioLevel] = useState(0);
  const [fakeIsListening, setFakeIsListening] = useState(false);
  const [fakeSpeaking, setFakeSpeaking] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const started = useRef(false);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Prevent double-start outside StrictMode; StrictMode resets via cleanup below
    if (started.current) return;
    started.current = true;

    // Select script based on case
    const caseId = (sessionStorage.getItem('shem-demo-case') || 'heartconnect') as DemoCaseId;
    const buildScript = SCRIPTS[caseId] || SCRIPTS.heartconnect;
    const script = buildScript();

    let cumDelay = 0;

    for (const step of script) {
      cumDelay += step.delay;

      if (step.type === 'assistant') {
        const text = step.text;
        const startAt = cumDelay;

        // Start streaming
        timers.current.push(setTimeout(() => {
          setIsStreaming(true);
          setFakeSpeaking(true);
          setStreamingText('');

          // Typewriter
          let charIdx = 0;
          const typeInterval = setInterval(() => {
            charIdx++;
            setStreamingText(text.slice(0, charIdx));
            if (charIdx >= text.length) {
              clearInterval(typeInterval);
              // Commit message
              setIsStreaming(false);
              setFakeSpeaking(false);
              setStreamingText('');
              setMessages(prev => [...prev, { role: 'assistant', content: text }]);
            }
          }, CHAR_DELAY);
          intervals.current.push(typeInterval);
        }, startAt));

        // Add typewriter duration to cumulative delay
        cumDelay += text.length * CHAR_DELAY + 200;

      } else if (step.type === 'user') {
        const text = step.text;
        const startAt = cumDelay;
        const speakDuration = 1200;

        // Simulate user speaking (fake audio levels)
        timers.current.push(setTimeout(() => {
          setFakeIsListening(true);
          const audioInterval = setInterval(() => {
            setFakeAudioLevel(0.3 + Math.random() * 0.5);
          }, FAKE_AUDIO_INTERVAL);
          intervals.current.push(audioInterval);

          // Stop listening after speakDuration
          timers.current.push(setTimeout(() => {
            clearInterval(audioInterval);
            setFakeIsListening(false);
            setFakeAudioLevel(0);
            setLastUserMessage(text);
            setMessages(prev => [...prev, { role: 'user', content: text }]);

            // Fade user message after 3s
            timers.current.push(setTimeout(() => setLastUserMessage(null), 3000));
          }, speakDuration));
        }, startAt));

        cumDelay += speakDuration + 300;

      } else if (step.type === 'finalize') {
        const rec = step.recommendation;
        const startAt = cumDelay;

        timers.current.push(setTimeout(() => {
          setIsFinalizing(true);

          timers.current.push(setTimeout(() => {
            setIsFinalizing(false);
            setRecommendation(rec);
            setShowSparkle(true);

            timers.current.push(setTimeout(() => setShowSparkle(false), 2500));
          }, 1500));
        }, startAt));

        cumDelay += 2000;
      }
    }

    return () => {
      clearAll();
      started.current = false;
      // Reset state so StrictMode re-mount starts fresh
      setMessages([]);
      setIsStreaming(false);
      setStreamingText('');
      setRecommendation(null);
      setIsFinalizing(false);
      setShowSparkle(false);
      setFakeAudioLevel(0);
      setFakeIsListening(false);
      setFakeSpeaking(false);
      setLastUserMessage(null);
    };
  }, [enabled, clearAll]);

  // Cleanup on unmount
  useEffect(() => clearAll, [clearAll]);

  return {
    messages,
    isStreaming,
    streamingText,
    recommendation,
    isFinalizing,
    showSparkle,
    fakeAudioLevel,
    fakeIsListening,
    fakeSpeaking,
    lastUserMessage,
  };
}
