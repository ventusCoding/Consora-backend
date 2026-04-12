import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private model: Model<ReportDocument>,
  ) {}

  async create(
    reporterId: string,
    dto: {
      targetType: 'user' | 'checkin' | 'challenge';
      targetId: string;
      reason: string;
      details?: string;
    },
  ) {
    return this.model.create({
      reporter: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: new Types.ObjectId(dto.targetId),
      reason: dto.reason,
      details: dto.details || '',
    });
  }

  list() {
    return this.model
      .find()
      .populate('reporter', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  update(id: string, status: Report['status']) {
    return this.model
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();
  }
}
