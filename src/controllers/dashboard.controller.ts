import { Request, Response } from "express";
import mongoose from "mongoose";
import Issue from "../models/Issue";

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

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Execute all database queries in parallel
    const [myIssuesStats, assignedIssuesStats, recentIssues, highPriorityAssigned] = 
      await Promise.all([
        // My issues aggregation
        Issue.aggregate([
          { $match: { createdBy: userObjectId } },
          {
            $facet: {
              total: [{ $count: "count" }],
              statusBreakdown: [
                { $group: { _id: "$status", count: { $sum: 1 } } }
              ],
              priorityBreakdown: [
                { $group: { _id: "$priority", count: { $sum: 1 } } }
              ],
              severityBreakdown: [
                { $group: { _id: "$severity", count: { $sum: 1 } } }
              ],
              timeBased: [
                {
                  $group: {
                    _id: null,
                    today: {
                      $sum: { $cond: [{ $gte: ["$createdAt", todayStart] }, 1, 0] }
                    },
                    thisWeek: {
                      $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] }
                    },
                    thisMonth: {
                      $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] }
                    }
                  }
                }
              ],
              // Add recent issues directly in aggregation
              recentMyIssues: [
                { $sort: { createdAt: -1 } },
                { $limit: 10 },
                {
                  $project: {
                    title: 1,
                    status: 1,
                    priority: 1,
                    severity: 1,
                    createdAt: 1,
                    updatedAt: 1
                  }
                }
              ]
            }
          }
        ]),

        // Assigned issues aggregation
        Issue.aggregate([
          { $match: { assignedTo: userObjectId } },
          {
            $facet: {
              total: [{ $count: "count" }],
              statusBreakdown: [
                { $group: { _id: "$status", count: { $sum: 1 } } }
              ],
              unresolved: [
                { $match: { status: { $nin: ["Resolved", "Closed"] } } },
                { $count: "count" }
              ],
              // Add recent assigned issues directly
              recentAssignedIssues: [
                { $sort: { createdAt: -1 } },
                { $limit: 10 },
                {
                  $project: {
                    title: 1,
                    status: 1,
                    priority: 1,
                    severity: 1,
                    createdAt: 1,
                    updatedAt: 1
                  }
                }
              ]
            }
          }
        ]),

        // Recent activity (combined) - simplified query
        Issue.find({ 
          $or: [{ createdBy: userObjectId }, { assignedTo: userObjectId }] 
        })
          .sort({ updatedAt: -1 })
          .limit(10)
          .select("title status priority severity updatedAt createdAt")
          .lean(),

        // High priority assigned
        Issue.find({
          assignedTo: userObjectId,
          priority: { $in: ["High", "Critical"] },
          status: { $ne: "Closed" },
        })
          .sort({ priority: -1, createdAt: -1 })
          .limit(5)
          .select("title status priority severity createdAt")
          .lean(),
      ]);

    // Type for aggregation result
    type AggregationStat = { _id: string; count: number };

    // Extract data from aggregations
    const myStats = myIssuesStats[0] || {};
    const assignedStats = assignedIssuesStats[0] || {};

    const myIssues = myStats.total?.[0]?.count || 0;
    const assignedToMe = assignedStats.total?.[0]?.count || 0;
    
    const myStatusStats: AggregationStat[] = (myStats.statusBreakdown || []) as AggregationStat[];
    const myPriorityStats: AggregationStat[] = (myStats.priorityBreakdown || []) as AggregationStat[];
    const mySeverityStats: AggregationStat[] = (myStats.severityBreakdown || []) as AggregationStat[];
    const timeBasedData = myStats.timeBased?.[0] || { today: 0, thisWeek: 0, thisMonth: 0 };

    // Calculate status counts
    const myOpenIssues = myStatusStats.find((s) => s._id === "Open")?.count || 0;
    const myInProgressIssues = myStatusStats.find((s) => s._id === "In Progress")?.count || 0;
    const myResolvedIssues = myStatusStats.find((s) => s._id === "Resolved")?.count || 0;
    const myClosedIssues = myStatusStats.find((s) => s._id === "Closed")?.count || 0;

    const assignedStatusStats = assignedStats.statusBreakdown || [];
    const assignedOpen = assignedStatusStats.find((s: any) => s._id === "Open")?.count || 0;
    const assignedInProgress = assignedStatusStats.find((s: any) => s._id === "In Progress")?.count || 0;
    const unresolvedAssigned = assignedStats.unresolved?.[0]?.count || 0;

    // Get recent issues from aggregation results
    const myRecentIssues = myStats.recentMyIssues || [];
    const assignedRecentIssues = assignedStats.recentAssignedIssues || [];

    // Priority Breakdown for my issues
    const myPriorityBreakdown = myPriorityStats.map((stat: AggregationStat) => ({
      priority: stat._id,
      count: stat.count,
      percentage: myIssues > 0 ? ((stat.count / myIssues) * 100).toFixed(1) : "0",
    }));

    // Severity Breakdown for my issues
    const mySeverityBreakdown = mySeverityStats.map((stat: AggregationStat) => ({
      severity: stat._id,
      count: stat.count,
      percentage: myIssues > 0 ? ((stat.count / myIssues) * 100).toFixed(1) : "0",
    }));

    // Status Breakdown for my issues
    const myStatusBreakdown = myStatusStats.map((stat: AggregationStat) => ({
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
    const myIssuesByPriority = myPriorityStats.reduce((acc: Record<string, number>, stat: AggregationStat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Issues by Severity for charts (my issues)
    const myIssuesBySeverity = mySeverityStats.reduce((acc: Record<string, number>, stat: AggregationStat) => {
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
        today: timeBasedData.today,
        thisWeek: timeBasedData.thisWeek,
        thisMonth: timeBasedData.thisMonth,
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
      recentActivity: recentIssues,
      highPriorityAssigned,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};