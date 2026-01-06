import { Request, Response } from "express";
import { validationResult } from "express-validator";
import Issue from "../models/Issue";
import { IIssueQuery } from "../types";
//issueController
export const getAllIssues = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      status,
      priority,
      severity,
      search,
      page = "1",
      limit = "10",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query as IIssueQuery;

    const filter: any = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (severity) filter.severity = severity;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === "desc" ? -1 : 1,
    };

    const issues = await Issue.find(filter)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .sort(sortObj)
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Issue.countDocuments(filter);

    const statusCounts = await Issue.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    res.json({
      issues,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
      statusCounts: statusCounts.reduce((acc: any, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const getIssueById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email");

    if (!issue) {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }

    res.json(issue);
  } catch (err: any) {
    console.error(err);
    if (err.kind === "ObjectId") {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }
    res.status(500).send("Server error");
  }
};

export const createIssue = async (
  req: Request,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const newIssue = new Issue({
      ...req.body,
      createdBy: req.user?.id,
    });

    const issue = await newIssue.save();
    await issue.populate("createdBy", "name email");

    res.json(issue);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const updateIssue = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { title, description, status, priority, severity, assignedTo } =
    req.body;

  try {
    let issue = await Issue.findById(req.params.id);

    if (!issue) {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }

    const updateFields: any = {};
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (status) updateFields.status = status;
    if (priority) updateFields.priority = priority;
    if (severity) updateFields.severity = severity;
    if (assignedTo) updateFields.assignedTo = assignedTo;

    if (
      status &&
      (status === "Resolved" || status === "Closed") &&
      issue.status !== status
    ) {
      updateFields.resolvedAt = Date.now();
    }

    issue = await Issue.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    )
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email");

    res.json(issue);
  } catch (err: any) {
    console.error(err);
    if (err.kind === "ObjectId") {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }
    res.status(500).send("Server error");
  }
};

export const deleteIssue = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }

    await issue.deleteOne();

    res.json({ msg: "Issue removed" });
  } catch (err: any) {
    console.error(err);
    if (err.kind === "ObjectId") {
      res.status(404).json({ msg: "Issue not found" });
      return;
    }
    res.status(500).send("Server error");
  }
};
