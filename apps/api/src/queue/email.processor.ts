import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOBS, SendEmailJobData } from './queue.constants';
import { PrismaService } from '../prisma/prisma.service';
import { emailPreference } from './email-preferences';

@Processor(QUEUES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter!: nodemailer.Transporter;
  private readonly templateCache = new Map<string, Handlebars.TemplateDelegate>();

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    super();
    this.initTransporter();
  }

  private initTransporter(): void {
    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('email.host'),
      port:   this.config.get<number>('email.port') ?? 587,
      secure: this.config.get<boolean>('email.secure') ?? false,
      auth: {
        user: this.config.get<string>('email.user'),
        pass: this.config.get<string>('email.pass'),
      },
    });
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOBS.SEND_EMAIL:
        await this.handleSendEmail(job as Job<SendEmailJobData>);
        break;
      default:
        this.logger.warn(`Unknown email job: ${job.name}`);
    }
  }

  private async handleSendEmail(job: Job<SendEmailJobData>): Promise<void> {
    const { to, subject, template, data } = job.data;

    const preference = emailPreference(template, data);
    if (preference) {
      // Evaluate at delivery time, including jobs queued before a preference was changed.
      const recipient = await this.prisma.user.findUnique({
        where: { email: to.trim().toLowerCase() },
        select: { pushEnabled: true, emailMessages: true, emailReviewReminders: true, emailOffers: true },
      });
      if (recipient && !recipient[preference]) return;
    }

    this.logger.log(`Sending email: template="${template}" to="${to}" subject="${subject}"`);

    const html = this.renderTemplate(template, data);
    const from = `"${this.config.get<string>('email.fromName') ?? 'EziHubb'}" <${this.config.get<string>('email.from')}>`;

    await this.transporter.sendMail({ from, to, subject, html });

    this.logger.log(`Email sent: template="${template}" to="${to}"`);
  }

  private renderTemplate(templateName: string, data: Record<string, unknown>): string {
    let compiled: Handlebars.TemplateDelegate | undefined = this.templateCache.get(templateName);

    if (!compiled) {
      const templatePath = path.join(
        __dirname,
        'assets',
        'email-templates',
        `${templateName}.hbs`,
      );

      if (!fs.existsSync(templatePath)) {
        this.logger.warn(`Template not found: ${templatePath}, using fallback`);
        return this.fallbackTemplate(templateName, data);
      }

      const source = fs.readFileSync(templatePath, 'utf8');
      compiled = Handlebars.compile(source);
      this.templateCache.set(templateName, compiled);
    }

    return compiled(data);
  }

  private fallbackTemplate(template: string, data: Record<string, unknown>): string {
    const rows = Object.entries(data)
      .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${String(v)}</td></tr>`)
      .join('');
    return `<h2>Template: ${template}</h2><table>${rows}</table>`;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`Email job completed: id=${job.id} name=${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Email job failed: id=${job.id} name=${job.name} attempt=${job.attemptsMade} — ${error.message}`,
    );
  }
}
