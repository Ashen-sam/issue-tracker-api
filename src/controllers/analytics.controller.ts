import { Request, Response } from "express";
import mongoose from "mongoose";
import Issue from "../models/Issue";
import User from "../models/User";

// General Analytics - System-wide analytics
export const getGeneralAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);

    const yearStart = new Date(now);
    yearStart.setFullYear(yearStart.getFullYear() - 1);

    // Execute all aggregations in parallel for better performance
    const [
      totalStats,
      statusBreakdown,
      priorityBreakdown,
      severityBreakdown,
      timeBasedStats,
      resolutionStats,
      userActivityStats,
      trendData,
    ] = await Promise.all([
      // Total issues count
      Issue.countDocuments(),

      // Status breakdown
      Issue.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Priority breakdown
      Issue.aggregate([
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Severity breakdown
      Issue.aggregate([
        {
          $group: {
            _id: "$severity",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Time-based statistics
      Issue.aggregate([
        {
          $group: {
            _id: null,
            today: {
              $sum: { $cond: [{ $gte: ["$createdAt", todayStart] }, 1, 0] },
            },
            thisWeek: {
              $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] },
            },
            thisMonth: {
              $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] },
            },
            thisYear: {
              $sum: { $cond: [{ $gte: ["$createdAt", yearStart] }, 1, 0] },
            },
          },
        },
      ]),

      // Resolution statistics
      Issue.aggregate([
        {
          $match: { resolvedAt: { $exists: true, $ne: null } },
        },
        {
          $project: {
            resolutionTime: {
              $subtract: ["$resolvedAt", "$createdAt"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionTime: { $avg: "$resolutionTime" },
            minResolutionTime: { $min: "$resolutionTime" },
            maxResolutionTime: { $max: "$resolutionTime" },
            totalResolved: { $sum: 1 },
          },
        },
      ]),

      // User activity statistics (top creators and assignees)
      Promise.all([
        Issue.aggregate([
          {
            $group: {
              _id: "$createdBy",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $unwind: "$user",
          },
          {
            $project: {
              userId: "$_id",
              userName: "$user.name",
              userEmail: "$user.email",
              issuesCreated: "$count",
            },
          },
        ]),
        Issue.aggregate([
          {
            $match: { assignedTo: { $exists: true, $ne: null } },
          },
          {
            $group: {
              _id: "$assignedTo",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $unwind: "$user",
          },
          {
            $project: {
              userId: "$_id",
              userName: "$user.name",
              userEmail: "$user.email",
              issuesAssigned: "$count",
            },
          },
        ]),
      ]),

      // Trend data - issues created per month for the last 12 months
      Issue.aggregate([
        {
          $match: {
            createdAt: { $gte: yearStart },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    const totalIssues = totalStats;
    const timeBased = timeBasedStats[0] || {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      thisYear: 0,
    };
    const resolution = resolutionStats[0] || {
      avgResolutionTime: 0,
      minResolutionTime: 0,
      maxResolutionTime: 0,
      totalResolved: 0,
    };

    // Format status breakdown
    const statusData = statusBreakdown.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    // Format priority breakdown
    const priorityData = priorityBreakdown.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    // Format severity breakdown
    const severityData = severityBreakdown.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    // Format trend data
    const trend = trendData.map((item: any) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
      count: item.count,
    }));

    // Calculate percentages
    const statusBreakdownWithPercent = statusBreakdown.map((item: any) => ({
      status: item._id,
      count: item.count,
      percentage:
        totalIssues > 0
          ? ((item.count / totalIssues) * 100).toFixed(1)
          : "0",
    }));

    const priorityBreakdownWithPercent = priorityBreakdown.map((item: any) => ({
      priority: item._id,
      count: item.count,
      percentage:
        totalIssues > 0
          ? ((item.count / totalIssues) * 100).toFixed(1)
          : "0",
    }));

    const severityBreakdownWithPercent = severityBreakdown.map((item: any) => ({
      severity: item._id,
      count: item.count,
      percentage:
        totalIssues > 0
          ? ((item.count / totalIssues) * 100).toFixed(1)
          : "0",
    }));

    // Format resolution time (convert milliseconds to days)
    const avgResolutionDays =
      resolution.avgResolutionTime > 0
        ? (resolution.avgResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";
    const minResolutionDays =
      resolution.minResolutionTime > 0
        ? (resolution.minResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";
    const maxResolutionDays =
      resolution.maxResolutionTime > 0
        ? (resolution.maxResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";

    res.json({
      overview: {
        totalIssues,
        openIssues: statusData["Open"] || 0,
        inProgressIssues: statusData["In Progress"] || 0,
        resolvedIssues: statusData["Resolved"] || 0,
        closedIssues: statusData["Closed"] || 0,
      },
      timeBased: {
        today: timeBased.today,
        thisWeek: timeBased.thisWeek,
        thisMonth: timeBased.thisMonth,
        thisYear: timeBased.thisYear,
      },
      breakdowns: {
        status: statusBreakdownWithPercent,
        priority: priorityBreakdownWithPercent,
        severity: severityBreakdownWithPercent,
      },
      charts: {
        byStatus: statusData,
        byPriority: priorityData,
        bySeverity: severityData,
      },
      resolution: {
        totalResolved: resolution.totalResolved,
        avgResolutionDays: parseFloat(avgResolutionDays),
        minResolutionDays: parseFloat(minResolutionDays),
        maxResolutionDays: parseFloat(maxResolutionDays),
        resolutionRate:
          totalIssues > 0
            ? ((resolution.totalResolved / totalIssues) * 100).toFixed(1)
            : "0",
      },
      userActivity: {
        topCreators: userActivityStats[0],
        topAssignees: userActivityStats[1],
      },
      trends: {
        monthlyTrend: trend,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// User-specific Analytics
export const getUserAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ msg: "Invalid user ID" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Verify user exists
    const user = await User.findById(userObjectId);
    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);

    const yearStart = new Date(now);
    yearStart.setFullYear(yearStart.getFullYear() - 1);

    // Execute all aggregations in parallel
    const [
      createdIssuesStats,
      assignedIssuesStats,
      timeBasedStats,
      resolutionStats,
      trendData,
    ] = await Promise.all([
      // Issues created by user
      Issue.aggregate([
        { $match: { createdBy: userObjectId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            statusBreakdown: [
              { $group: { _id: "$status", count: { $sum: 1 } } },
            ],
            priorityBreakdown: [
              { $group: { _id: "$priority", count: { $sum: 1 } } },
            ],
            severityBreakdown: [
              { $group: { _id: "$severity", count: { $sum: 1 } } },
            ],
            timeBased: [
              {
                $group: {
                  _id: null,
                  today: {
                    $sum: {
                      $cond: [{ $gte: ["$createdAt", todayStart] }, 1, 0],
                    },
                  },
                  thisWeek: {
                    $sum: {
                      $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0],
                    },
                  },
                  thisMonth: {
                    $sum: {
                      $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0],
                    },
                  },
                  thisYear: {
                    $sum: {
                      $cond: [{ $gte: ["$createdAt", yearStart] }, 1, 0],
                    },
                  },
                },
              },
            ],
          },
        },
      ]),

      // Issues assigned to user
      Issue.aggregate([
        { $match: { assignedTo: userObjectId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            statusBreakdown: [
              { $group: { _id: "$status", count: { $sum: 1 } } },
            ],
            priorityBreakdown: [
              { $group: { _id: "$priority", count: { $sum: 1 } } },
            ],
            unresolved: [
              {
                $match: { status: { $nin: ["Resolved", "Closed"] } },
              },
              { $count: "count" },
            ],
          },
        },
      ]),

      // Time-based statistics for created issues
      Issue.aggregate([
        { $match: { createdBy: userObjectId } },
        {
          $group: {
            _id: null,
            today: {
              $sum: { $cond: [{ $gte: ["$createdAt", todayStart] }, 1, 0] },
            },
            thisWeek: {
              $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] },
            },
            thisMonth: {
              $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] },
            },
            thisYear: {
              $sum: { $cond: [{ $gte: ["$createdAt", yearStart] }, 1, 0] },
            },
          },
        },
      ]),

      // Resolution statistics for issues created by user
      Issue.aggregate([
        {
          $match: {
            createdBy: userObjectId,
            resolvedAt: { $exists: true, $ne: null },
          },
        },
        {
          $project: {
            resolutionTime: {
              $subtract: ["$resolvedAt", "$createdAt"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionTime: { $avg: "$resolutionTime" },
            minResolutionTime: { $min: "$resolutionTime" },
            maxResolutionTime: { $max: "$resolutionTime" },
            totalResolved: { $sum: 1 },
          },
        },
      ]),

      // Trend data - issues created per month
      Issue.aggregate([
        {
          $match: {
            createdBy: userObjectId,
            createdAt: { $gte: yearStart },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    const createdStats = createdIssuesStats[0] || {};
    const assignedStats = assignedIssuesStats[0] || {};

    const totalCreated = createdStats.total?.[0]?.count || 0;
    const totalAssigned = assignedStats.total?.[0]?.count || 0;
    const unresolvedAssigned = assignedStats.unresolved?.[0]?.count || 0;

    const createdStatusBreakdown =
      (createdStats.statusBreakdown || []) as Array<{
        _id: string;
        count: number;
      }>;
    const createdPriorityBreakdown =
      (createdStats.priorityBreakdown || []) as Array<{
        _id: string;
        count: number;
      }>;
    const createdSeverityBreakdown =
      (createdStats.severityBreakdown || []) as Array<{
        _id: string;
        count: number;
      }>;

    const assignedStatusBreakdown =
      (assignedStats.statusBreakdown || []) as Array<{
        _id: string;
        count: number;
      }>;

    const timeBased = timeBasedStats[0] || {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      thisYear: 0,
    };

    const resolution = resolutionStats[0] || {
      avgResolutionTime: 0,
      minResolutionTime: 0,
      maxResolutionTime: 0,
      totalResolved: 0,
    };

    // Format breakdowns with percentages
    const createdStatusBreakdownWithPercent = createdStatusBreakdown.map(
      (item) => ({
        status: item._id,
        count: item.count,
        percentage:
          totalCreated > 0
            ? ((item.count / totalCreated) * 100).toFixed(1)
            : "0",
      })
    );

    const createdPriorityBreakdownWithPercent = createdPriorityBreakdown.map(
      (item) => ({
        priority: item._id,
        count: item.count,
        percentage:
          totalCreated > 0
            ? ((item.count / totalCreated) * 100).toFixed(1)
            : "0",
      })
    );

    const createdSeverityBreakdownWithPercent = createdSeverityBreakdown.map(
      (item) => ({
        severity: item._id,
        count: item.count,
        percentage:
          totalCreated > 0
            ? ((item.count / totalCreated) * 100).toFixed(1)
            : "0",
      })
    );

    // Format charts data
    const createdStatusData = createdStatusBreakdown.reduce(
      (acc: Record<string, number>, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    const createdPriorityData = createdPriorityBreakdown.reduce(
      (acc: Record<string, number>, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    const createdSeverityData = createdSeverityBreakdown.reduce(
      (acc: Record<string, number>, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    const assignedStatusData = assignedStatusBreakdown.reduce(
      (acc: Record<string, number>, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    // Format trend data
    const trend = trendData.map((item: any) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
      count: item.count,
    }));

    // Format resolution time
    const avgResolutionDays =
      resolution.avgResolutionTime > 0
        ? (resolution.avgResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";
    const minResolutionDays =
      resolution.minResolutionTime > 0
        ? (resolution.minResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";
    const maxResolutionDays =
      resolution.maxResolutionTime > 0
        ? (resolution.maxResolutionTime / (1000 * 60 * 60 * 24)).toFixed(2)
        : "0";

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      overview: {
        totalCreated,
        totalAssigned,
        unresolvedAssigned,
        createdOpen: createdStatusData["Open"] || 0,
        createdInProgress: createdStatusData["In Progress"] || 0,
        createdResolved: createdStatusData["Resolved"] || 0,
        createdClosed: createdStatusData["Closed"] || 0,
        assignedOpen: assignedStatusData["Open"] || 0,
        assignedInProgress: assignedStatusData["In Progress"] || 0,
        assignedResolved: assignedStatusData["Resolved"] || 0,
        assignedClosed: assignedStatusData["Closed"] || 0,
      },
      timeBased: {
        today: timeBased.today,
        thisWeek: timeBased.thisWeek,
        thisMonth: timeBased.thisMonth,
        thisYear: timeBased.thisYear,
      },
      createdIssues: {
        breakdowns: {
          status: createdStatusBreakdownWithPercent,
          priority: createdPriorityBreakdownWithPercent,
          severity: createdSeverityBreakdownWithPercent,
        },
        charts: {
          byStatus: createdStatusData,
          byPriority: createdPriorityData,
          bySeverity: createdSeverityData,
        },
      },
      assignedIssues: {
        breakdowns: {
          status: assignedStatusBreakdown.map((item) => ({
            status: item._id,
            count: item.count,
            percentage:
              totalAssigned > 0
                ? ((item.count / totalAssigned) * 100).toFixed(1)
                : "0",
          })),
        },
        charts: {
          byStatus: assignedStatusData,
        },
      },
      resolution: {
        totalResolved: resolution.totalResolved,
        avgResolutionDays: parseFloat(avgResolutionDays),
        minResolutionDays: parseFloat(minResolutionDays),
        maxResolutionDays: parseFloat(maxResolutionDays),
        resolutionRate:
          totalCreated > 0
            ? ((resolution.totalResolved / totalCreated) * 100).toFixed(1)
            : "0",
      },
      trends: {
        monthlyTrend: trend,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

