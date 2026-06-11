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
  daysRemaining: number;
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

export async function fetchMintData(token: string, userId: string): Promise<MintAccountInfo> {
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

  // Extract variables
  const phone = accountData.msisdn || accountData.phone?.msisdn;
  const activePlanId = accountData.plan?.id || accountData.phone?.plan?.id;
  const endOfCycle = accountData.plan?.endOfCycle || accountData.phone?.plan?.endOfCycle || 0;
  
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
  const diffSec = endOfCycle - nowSec;
  const daysRemaining = Math.max(0, Math.ceil(diffSec / 86400));
  const cycleEndDate = endOfCycle ? new Date(endOfCycle * 1000).toISOString() : new Date().toISOString();

  return {
    phone,
    planName,
    cycleEndDate,
    daysRemaining,
    dataUsedGb,
    dataRemainingGb,
    dataTotalGb,
    dataPercentUsed,
  };
}
