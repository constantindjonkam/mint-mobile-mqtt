// Mint Mobile API client methods

export interface UsageData {
  remainingHighSpeedData: number;
  totalHighSpeedData: number;
  usageHighSpeedData: number;
  usageTether4G: number;
}

export interface PlanData {
  id: string;
  endOfCycle: number;
  currentDays: number;
  displayName: string;
}

export interface MintAccountInfo {
  phone: string;
  planName: string;
  cycleEndDate: string;
  daysRemaining: number;      // Days remaining in month
  daysRemainingPlan: number;  // Days remaining in plan overall
  planMonths: number;         // Months purchased
  lineName: string;
  lastUpdated: string;
  dataUsedGb: number;
  dataRemainingGb: number;
  dataTotalGb: number;
  dataPercentUsed: number;
}

const COMMON_HEADERS = {
  'accept': '*/*',
  'channel': 'web-am',
  'origin': 'https://my.mintmobile.com',
  'referer': 'https://my.mintmobile.com/',
  'sec-ch-ua': '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
};

export async function fetchMintData(token: string, userId: string): Promise<MintAccountInfo[]> {
  // 1. Fetch Account Details
  const accountUrl = `https://mint-gateway.mintmobile.com/v1/mint/account/${userId}?&subscriberType=PHONE`;
  const accountRes = await fetch(accountUrl, {
    headers: {
      ...COMMON_HEADERS,
      'authorization': `Bearer ${token}`,
    },
  });
  if (!accountRes.ok) {
    throw new Error(`Failed to fetch account info: ${accountRes.statusText}`);
  }
  const accountData = await accountRes.json() as any;

  // 2. Fetch Plans to get displayName
  const plansUrl = `https://mint-gateway.mintmobile.com/v1/mint/account/${userId}/plans`;
  const plansRes = await fetch(plansUrl, {
    headers: {
      ...COMMON_HEADERS,
      'authorization': `Bearer ${token}`,
    },
  });
  if (!plansRes.ok) {
    throw new Error(`Failed to fetch plans: ${plansRes.statusText}`);
  }
  const plansData = await plansRes.json() as any;

  // 3. Fetch Data Usage
  const usageUrl = `https://mint-gateway.mintmobile.com/v2/mint/account/${userId}/usage`;
  const usageRes = await fetch(usageUrl, {
    method: 'POST',
    headers: {
      ...COMMON_HEADERS,
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      types: ['data'],
      subscriberType: 'PHONE',
    }),
  });
  if (!usageRes.ok) {
    throw new Error(`Failed to fetch usage: ${usageRes.statusText}`);
  }
  const usageData = await usageRes.json() as any;

  // Extract variables for primary line
  const phone = accountData.msisdn || accountData.phone?.msisdn || '';
  const activePlanId = accountData.plan?.id || accountData.phone?.plan?.id;
  const endOfCycle = accountData.plan?.endOfCycle || accountData.phone?.plan?.endOfCycle || 0;
  const planExp = accountData.plan?.exp || accountData.phone?.plan?.exp || 0;
  const planMonths = accountData.plan?.months || accountData.phone?.plan?.months || 0;
  const lineName = accountData.firstName || accountData.phone?.firstName || 'Mint Line';
  
  // Resolve plan name
  const allAvailablePlans = [
    ...(plansData?.availablePlans || []),
    ...(plansData?.phone?.availablePlans || [])
  ];
  const activePlanInfo = allAvailablePlans.find((p: any) => p.id === activePlanId);
  const planName = activePlanInfo ? activePlanInfo.displayName : `Plan ${activePlanId}`;

  // Parse usage data (in MB)
  const remainingMb = usageData.remainingHighSpeedData ?? 0;
  const totalMb = usageData.totalHighSpeedData ?? 1; // avoid division by zero
  const usedMb = usageData.usageHighSpeedData ?? 0;

  // Calculations
  const dataTotalGb = +(totalMb / 1024).toFixed(2);
  const dataUsedGb = +(usedMb / 1024).toFixed(2);
  const dataRemainingGb = +(remainingMb / 1024).toFixed(2);
  const dataPercentUsed = +(Math.min(100, Math.max(0, (usedMb / totalMb) * 100))).toFixed(2);

  // Time calculations
  const nowSec = Math.floor(Date.now() / 1000);
  
  const diffSecMonth = endOfCycle - nowSec;
  const daysRemaining = Math.max(0, Math.ceil(diffSecMonth / 86400));
  const cycleEndDate = endOfCycle ? new Date(endOfCycle * 1000).toISOString() : new Date().toISOString();

  const diffSecPlan = planExp - nowSec;
  const daysRemainingPlan = Math.max(0, Math.ceil(diffSecPlan / 86400));

  const lastUpdated = new Date().toISOString();

  const results: MintAccountInfo[] = [
    {
      phone,
      planName,
      cycleEndDate,
      daysRemaining,
      daysRemainingPlan,
      planMonths,
      lineName,
      lastUpdated,
      dataUsedGb,
      dataRemainingGb,
      dataTotalGb,
      dataPercentUsed,
    }
  ];

  // Try to fetch linked multi-line accounts
  try {
    const multiLineUrl = `https://mint-gateway.mintmobile.com/v1/mint/account/${userId}/multi-line`;
    const multiLineRes = await fetch(multiLineUrl, {
      headers: {
        ...COMMON_HEADERS,
        'authorization': `Bearer ${token}`,
      },
    });

    if (multiLineRes.ok) {
      const multiLineData = await multiLineRes.json() as any;
      const activeMembers = multiLineData.activeMembers || [];

      for (const member of activeMembers) {
        try {
          const memberUsageUrl = `https://mint-gateway.mintmobile.com/v1/mint/account/${userId}/multi-line/${member.id}/usage`;
          const memberUsageRes = await fetch(memberUsageUrl, {
            headers: {
              ...COMMON_HEADERS,
              'authorization': `Bearer ${token}`,
            },
          });

          if (memberUsageRes.ok) {
            const memberUsageJson = await memberUsageRes.json() as any;
            
            // Extract usage info from nested data object
            const mData = memberUsageJson.data || {};
            const mRemainingMb = mData.remaining4G ?? 0;
            const mUsedMb = mData.usage4G ?? 0;
            const mTotalMb = mRemainingMb + mUsedMb;

            const mDataTotalGb = +(mTotalMb / 1024).toFixed(2);
            const mDataUsedGb = +(mUsedMb / 1024).toFixed(2);
            const mDataRemainingGb = +(mRemainingMb / 1024).toFixed(2);
            const mDataPercentUsed = mTotalMb > 0 ? +(Math.min(100, Math.max(0, (mUsedMb / mTotalMb) * 100))).toFixed(2) : 0;

            // Compute dates for member
            const mEndOfCycle = member.currentPlan?.rechargeDate || 0;
            const mPlanExp = member.nextPlan?.renewalDate || 0;
            const mPlanMonths = member.currentPlan?.duration || 0;

            const mDiffSecMonth = mEndOfCycle - nowSec;
            const mDaysRemaining = Math.max(0, Math.ceil(mDiffSecMonth / 86400));
            const mCycleEndDate = mEndOfCycle ? new Date(mEndOfCycle * 1000).toISOString() : new Date().toISOString();

            const mDiffSecPlan = mPlanExp - nowSec;
            const mDaysRemainingPlan = Math.max(0, Math.ceil(mDiffSecPlan / 86400));

            results.push({
              phone: member.msisdn || '',
              planName: `Family Line`,
              cycleEndDate: mCycleEndDate,
              daysRemaining: mDaysRemaining,
              daysRemainingPlan: mDaysRemainingPlan,
              planMonths: mPlanMonths,
              lineName: member.nickName || 'Mint Family Line',
              lastUpdated,
              dataUsedGb: mDataUsedGb,
              dataRemainingGb: mDataRemainingGb,
              dataTotalGb: mDataTotalGb,
              dataPercentUsed: mDataPercentUsed,
            });
          }
        } catch (memberErr) {
          console.error(`[daemon] Error fetching details for member ${member.msisdn}:`, memberErr);
        }
      }
    }
  } catch (multiLineErr) {
    // Fail silently or just log warning since single lines return 404
    console.debug(`[daemon] Multi-line lookup skipped or unavailable.`);
  }

  return results;
}

