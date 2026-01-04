import { Request, Response } from "express";
import mongoose from "mongoose";
import Issue from "../models/Issue";
import User from "../models/User";

export const getDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ msg: "User not authenticated" });
      return;
    }

    // Get current date ranges
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);

    // User-specific Statistics
    const myIssues = await Issue.countDocuments({ createdBy: userId });
    const assignedToMe = await Issue.countDocuments({ assignedTo: userId });
    
    const myOpenIssues = await Issue.countDocuments({
      createdBy: userId,
      status: "Open",
    });
    
    const myInProgressIssues = await Issue.countDocuments({
      createdBy: userId,
      status: "In Progress",
    });
    
    const myResolvedIssues = await Issue.countDocuments({
      createdBy: userId,
      status: "Resolved",
    });
    
    const myClosedIssues = await Issue.countDocuments({
      createdBy: userId,
      status: "Closed",
    });

    // Issues assigned to me
    const assignedOpen = await Issue.countDocuments({
      assignedTo: userId,
      status: "Open",
    });
    
    const assignedInProgress = await Issue.countDocuments({
      assignedTo: userId,
      status: "In Progress",
    });

    // Time-based Statistics for user
    const myIssuesToday = await Issue.countDocuments({
      createdBy: userId,
      createdAt: { $gte: todayStart },
    });
    
    const myIssuesThisWeek = await Issue.countDocuments({
      createdBy: userId,
      createdAt: { $gte: weekStart },
    });
    
    const myIssuesThisMonth = await Issue.countDocuments({
      createdBy: userId,
      createdAt: { $gte: monthStart },
    });

    // Priority Statistics for user's issues
    const myPriorityStats = await Issue.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    // Severity Statistics for user's issues
    const mySeverityStats = await Issue.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$severity",
          count: { $sum: 1 },
        },
      },
    ]);

    // Status Statistics for user's issues
    const myStatusStats = await Issue.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Recent Issues created by user (Last 10)
    const myRecentIssues = await Issue.find({ createdBy: userId })
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title status priority severity createdAt updatedAt assignedTo");

    // Recent Issues assigned to user (Last 10)
    const assignedRecentIssues = await Issue.find({ assignedTo: userId })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title status priority severity createdAt updatedAt createdBy");

    // Recent Activity (Recently updated issues by or assigned to user)
    const recentActivity = await Issue.find({
      $or: [{ createdBy: userId }, { assignedTo: userId }],
    })
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .sort({ updatedAt: -1 })
      .limit(10)
      .select("title status priority severity updatedAt createdAt createdBy assignedTo");

    // High Priority Issues assigned to me
    const highPriorityAssigned = await Issue.find({
      assignedTo: userId,
      priority: { $in: ["High", "Critical"] },
      status: { $ne: "Closed" },
    })
      .populate("createdBy", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .limit(5)
      .select("title status priority severity createdAt createdBy");

    // Unresolved Issues assigned to me
    const unresolvedAssigned = await Issue.countDocuments({
      assignedTo: userId,
      status: { $nin: ["Resolved", "Closed"] },
    });

    // Priority Breakdown for my issues
    const myPriorityBreakdown = myPriorityStats.map((stat) => ({
      priority: stat._id,
      count: stat.count,
      percentage: myIssues > 0 ? ((stat.count / myIssues) * 100).toFixed(1) : "0",
    }));

    // Severity Breakdown for my issues
    const mySeverityBreakdown = mySeverityStats.map((stat) => ({
      severity: stat._id,
      count: stat.count,
      percentage: myIssues > 0 ? ((stat.count / myIssues) * 100).toFixed(1) : "0",
    }));

    // Status Breakdown for my issues
    const myStatusBreakdown = myStatusStats.map((stat) => ({
      status: stat._id,
      count: stat.count,
      percentage: myIssues > 0 ? ((stat.count / myIssues) * 100).toFixed(1) : "0",
    }));

    // Issues by Status for charts (my issues)
    const myIssuesByStatus = {
      Open: myOpenIssues,
      "In Progress": myInProgressIssues,
      Resolved: myResolvedIssues,
      Closed: myClosedIssues,
    };

    // Issues by Priority for charts (my issues)
    const myIssuesByPriority = myPriorityStats.reduce((acc: any, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Issues by Severity for charts (my issues)
    const myIssuesBySeverity = mySeverityStats.reduce((acc: any, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Response
    res.json({
      userStats: {
        myIssues,
        assignedToMe,
        myOpenIssues,
        myInProgressIssues,
        myResolvedIssues,
        myClosedIssues,
        assignedOpen,
        assignedInProgress,
        unresolvedAssigned,
      },
      timeBased: {
        today: myIssuesToday,
        thisWeek: myIssuesThisWeek,
        thisMonth: myIssuesThisMonth,
      },
      breakdowns: {
        status: myStatusBreakdown,
        priority: myPriorityBreakdown,
        severity: mySeverityBreakdown,
      },
      charts: {
        byStatus: myIssuesByStatus,
        byPriority: myIssuesByPriority,
        bySeverity: myIssuesBySeverity,
      },
      recentIssues: {
        myIssues: myRecentIssues,
        assignedToMe: assignedRecentIssues,
      },
      recentActivity,
      highPriorityAssigned,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

