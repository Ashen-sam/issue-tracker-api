import mongoose, { Document, Schema } from "mongoose";

export type IssueStatus = "Open" | "In Progress" | "Resolved" | "Closed";
export type IssuePriority = "Low" | "Medium" | "High" | "Critical";
export type IssueSeverity = "Minor" | "Major" | "Critical";

export interface IIssue extends Document {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  severity: IssueSeverity;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  foundDate?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const issueSchema = new Schema<IIssue>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    severity: {
      type: String,
      enum: ["Minor", "Major", "Critical"],
      default: "Minor",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    foundDate: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up common filters and dashboard aggregations
issueSchema.index({ createdBy: 1 });
issueSchema.index({ assignedTo: 1 });
issueSchema.index({ status: 1 });
issueSchema.index({ priority: 1 });
issueSchema.index({ severity: 1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ updatedAt: -1 });

// Compound indexes for common query patterns to improve performance
issueSchema.index({ status: 1, createdAt: -1 }); // For filtering by status and sorting by date
issueSchema.index({ priority: 1, status: 1 }); // For filtering by priority and status
issueSchema.index({ severity: 1, status: 1 }); // For filtering by severity and status
issueSchema.index({ status: 1, priority: 1, createdAt: -1 }); // For complex queries
// Dashboard-specific indexes for better performance
issueSchema.index({ createdBy: 1, status: 1 }); // For dashboard: my issues by status
issueSchema.index({ createdBy: 1, createdAt: -1 }); // For dashboard: my recent issues
issueSchema.index({ assignedTo: 1, status: 1 }); // For dashboard: assigned issues by status
issueSchema.index({ assignedTo: 1, createdAt: -1 }); // For dashboard: assigned recent issues
issueSchema.index({ assignedTo: 1, priority: 1, status: 1 }); // For dashboard: high priority assigned
issueSchema.index({ createdBy: 1, priority: 1 }); // For dashboard: priority breakdown
issueSchema.index({ createdBy: 1, severity: 1 }); // For dashboard: severity breakdown
// Text index for search functionality (title and description)
issueSchema.index({ title: "text", description: "text" });

export default mongoose.model<IIssue>("Issue", issueSchema);
