import { Job } from 'bullmq';
import { validate } from 'class-validator';
import { NotificationPreferencesDto } from '../modules/users/dto/notification-preferences.dto';
import { EmailProcessor } from './email.processor';
import { emailPreference } from './email-preferences';
import { JOBS, SendEmailJobData } from './queue.constants';

describe('Notification preferences', () => {
  it('classifies optional emails without suppressing essential messages', () => {
    expect(emailPreference('new-message', {})).toBe('emailMessages');
    expect(emailPreference('new-message', { isForAdmin: true })).toBeNull();
    expect(emailPreference('review-reminder', {})).toBe('emailReviewReminders');
    expect(emailPreference('abandoned-cart', {})).toBe('emailOffers');
    expect(emailPreference('targeted-offer', { isMarketing: true })).toBe('emailOffers');
    expect(emailPreference('targeted-offer', { headline: 'Your offer was accepted!' })).toBeNull();
    for (const template of ['reset-password', 'order-confirmation', 'order-shipped', 'refund-notification']) {
      expect(emailPreference(template, {})).toBeNull();
    }
  });

  it('rejects missing booleans and string values instead of treating false as truthy', async () => {
    expect((await validate(Object.assign(new NotificationPreferencesDto(), { pushEnabled: 'false' }))).length).toBe(4);
    expect(await validate(Object.assign(new NotificationPreferencesDto(), {
      pushEnabled: false, emailMessages: false, emailReviewReminders: false, emailOffers: false,
    }))).toHaveLength(0);
  });

  function setup(allowed: boolean) {
    const processor = Object.create(EmailProcessor.prototype) as EmailProcessor;
    const sendMail = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({ emailMessages: allowed });
    Object.assign(processor, {
      prisma: { user: { findUnique } }, transporter: { sendMail },
      config: { get: () => 'test' }, logger: { log: jest.fn() }, renderTemplate: () => 'Test email',
    });
    return { processor, sendMail, findUnique };
  }

  const job = (template: string) => ({ name: JOBS.SEND_EMAIL, data: {
    to: 'buyer@example.test', subject: 'Test', template, data: {},
  } }) as Job<SendEmailJobData>;

  it('checks saved preferences at delivery and suppresses disabled email', async () => {
    const { processor, sendMail, findUnique } = setup(false);
    await processor.process(job('new-message'));
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'buyer@example.test' } }));
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('delivers enabled optional email', async () => {
    const { processor, sendMail } = setup(true);
    await processor.process(job('new-message'));
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('always delivers essential email regardless of optional preferences', async () => {
    const { processor, sendMail, findUnique } = setup(false);
    await processor.process(job('reset-password'));
    expect(findUnique).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
