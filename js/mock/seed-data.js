/* =========================================================
   JALACHAYA - Demo (seed) data
   ---------------------------------------------------------
   Loaded into localStorage the first time the site is opened,
   or after "Reset demo data". Dates are relative to today so the
   demo always has new, in-progress and overdue complaints.

   There is ONE demo account per role (citizen, Panchayat officer,
   field worker). Complaints, evidence and ponds use the real sample
   photos listed in CONFIG.SAMPLE_IMAGES (assets/samples/):
   polluted-*.jpg as "before" photos and clean-*.jpg as "after".

   NOTE: passwords are plain text ONLY because this is browser demo
   data. The Spring Boot backend must store hashed passwords.
   ========================================================= */

function createSeedData() {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const P1 = CONFIG.SAMPLE_IMAGES.polluted[0].url;
  const P2 = CONFIG.SAMPLE_IMAGES.polluted[1].url;
  const P3 = CONFIG.SAMPLE_IMAGES.polluted[2].url;
  const K1 = CONFIG.SAMPLE_IMAGES.clean[0].url;
  const K2 = CONFIG.SAMPLE_IMAGES.clean[1].url;
  const K3 = CONFIG.SAMPLE_IMAGES.clean[2].url;

  function daysAgo(days) {
    return new Date(now - days * DAY).toISOString();
  }
  function daysFromNow(days) {
    return new Date(now + days * DAY).toISOString();
  }
  function entry(status, note, by, role, days) {
    return { status: status, note: note, by: by, role: role, at: daysAgo(days) };
  }
  function photo(url, caption, days) {
    return { url: url, caption: caption, addedBy: 'Anjali Menon', role: C, at: daysAgo(days) };
  }

  const C = 'COMMUNITY_MEMBER';
  const O = 'PANCHAYAT_OFFICER';
  const W = 'FIELD_WORKER';
  const CITIZEN = 'Anjali Menon';
  const OFFICER = 'Sreeja Varghese';
  const WORKER = 'Biju Thomas';
  const ASSIGNED_NOTE = 'Assigned to Biju Thomas (Sanitation Team A).';

  const users = [
    { id: 1, name: CITIZEN, email: 'citizen@jalachaya.in', password: 'citizen123', role: C, phone: '9847012345', ward: 'Ward 3', createdAt: daysAgo(60) },
    { id: 2, name: OFFICER, email: 'officer@jalachaya.in', password: 'officer123', role: O, phone: '0487 2350011', designation: 'Panchayat Secretary', createdAt: daysAgo(90) },
    { id: 3, name: WORKER, email: 'worker@jalachaya.in', password: 'worker123', role: W, phone: '9895011122', team: 'Sanitation Team A', createdAt: daysAgo(90) }
  ];

  const ponds = [
    { id: 1, name: 'Thamarakulam', ward: 'Ward 3', village: 'Puthur', areaAcres: 1.2, latitude: 10.4921, longitude: 76.2486, description: 'Temple-side pond used for bathing and washing. Stone steps on the east side.', imageUrl: K1, active: true, createdAt: daysAgo(90) },
    { id: 2, name: 'Chirakkal Kulam', ward: 'Ward 5', village: 'Ollur', areaAcres: 0.8, latitude: 10.4748, longitude: 76.2353, description: 'Community pond next to the market road. Receives runoff from two drains.', imageUrl: null, active: true, createdAt: daysAgo(90) },
    { id: 3, name: 'Ambalakulam', ward: 'Ward 7', village: 'Ayyanthole', areaAcres: 1.5, latitude: 10.5232, longitude: 76.2034, description: 'Large pond used for irrigation of nearby paddy fields during summer.', imageUrl: K2, active: true, createdAt: daysAgo(90) },
    { id: 4, name: 'Kuttikkadavu Pond', ward: 'Ward 2', village: 'Peechi', areaAcres: 0.6, latitude: 10.5310, longitude: 76.3290, description: 'Small pond near the school ground. Banks are partly unfenced.', imageUrl: null, active: true, createdAt: daysAgo(70) },
    { id: 5, name: 'Pallikulam', ward: 'Ward 9', village: 'Mannuthy', areaAcres: 2.0, latitude: 10.5326, longitude: 76.2741, description: 'Biggest pond in the panchayat. Fishing permitted with licence.', imageUrl: K3, active: true, createdAt: daysAgo(70) }
  ];

  const problems = [
    {
      id: 1, code: 'JC-1001', pondId: 1, reporterId: 1, category: 'PLASTIC_WASTE', priority: 'HIGH',
      description: 'Plastic bottles and carry bags collecting along the north bank after the festival.',
      landmark: 'North bank, near the banyan tree', latitude: 10.4923, longitude: 76.2484,
      images: [photo(P1, 'Reported photo', 20)],
      status: 'VERIFIED', rejectionReason: null, createdAt: daysAgo(20), updatedAt: daysAgo(14),
      history: [
        entry('SUBMITTED', 'Complaint submitted with 1 photo.', CITIZEN, C, 20),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 19),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 18),
        entry('COMPLETION_CLAIMED', 'Work completed and evidence submitted.', WORKER, W, 16),
        entry('COMMUNITY_VERIFICATION', 'Evidence reviewed. Sent for community verification.', OFFICER, O, 15),
        entry('VERIFIED', 'Confirmed by community: Banks look clean now.', CITIZEN, C, 14)
      ]
    },
    {
      id: 2, code: 'JC-1002', pondId: 1, reporterId: 1, category: 'ALGAE_WEED', priority: 'MEDIUM',
      description: 'Water hyacinth and floating waste spreading over the western half of the pond.',
      landmark: 'West side, behind the pump house', latitude: 10.4919, longitude: 76.2481,
      images: [photo(P2, 'Reported photo', 9)],
      status: 'COMMUNITY_VERIFICATION', rejectionReason: null, createdAt: daysAgo(9), updatedAt: daysAgo(3),
      history: [
        entry('SUBMITTED', 'Complaint submitted with 1 photo.', CITIZEN, C, 9),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 8),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 7),
        entry('COMPLETION_CLAIMED', 'Work completed and evidence submitted.', WORKER, W, 4),
        entry('COMMUNITY_VERIFICATION', 'Evidence reviewed. Sent for community verification.', OFFICER, O, 3)
      ]
    },
    {
      id: 3, code: 'JC-1003', pondId: 2, reporterId: 1, category: 'SEWAGE_DISCHARGE', priority: 'URGENT',
      description: 'Grey water from a drain pipe is flowing directly into the pond. Strong smell in the evening.',
      landmark: 'Market road side, near bus stop', latitude: 10.4750, longitude: 76.2356,
      images: [],
      status: 'IN_PROGRESS', rejectionReason: null, createdAt: daysAgo(8), updatedAt: daysAgo(5),
      history: [
        entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 8),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 7),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 5)
      ]
    },
    {
      id: 4, code: 'JC-1004', pondId: 3, reporterId: 1, category: 'DEAD_FISH', priority: 'MEDIUM',
      description: 'Around ten dead fish floating near the southern steps this morning.',
      landmark: 'Southern steps', latitude: 10.5229, longitude: 76.2036, images: [],
      status: 'SUBMITTED', rejectionReason: null, createdAt: daysAgo(1), updatedAt: daysAgo(1),
      history: [entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 1)]
    },
    {
      id: 5, code: 'JC-1005', pondId: 2, reporterId: 1, category: 'FOUL_SMELL', priority: 'MEDIUM',
      description: 'Water has turned dark green and there is a bad smell near the washing area.',
      landmark: 'Washing ghat', latitude: 10.4746, longitude: 76.2351, images: [],
      status: 'ASSIGNED', rejectionReason: null, createdAt: daysAgo(3), updatedAt: daysAgo(2),
      history: [
        entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 3),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 2)
      ]
    },
    {
      id: 6, code: 'JC-1006', pondId: 4, reporterId: 1, category: 'BANK_DUMPING', priority: 'HIGH',
      description: 'Construction debris and household waste dumped on the unfenced bank.',
      landmark: 'Near school compound wall', latitude: 10.5312, longitude: 76.3287,
      images: [photo(P3, 'Reported photo', 7)],
      status: 'COMPLETION_CLAIMED', rejectionReason: null, createdAt: daysAgo(7), updatedAt: daysAgo(1),
      history: [
        entry('SUBMITTED', 'Complaint submitted with 1 photo.', CITIZEN, C, 7),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 6),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 5),
        entry('COMPLETION_CLAIMED', 'Work completed and evidence submitted.', WORKER, W, 1)
      ]
    },
    {
      id: 7, code: 'JC-1007', pondId: 5, reporterId: 1, category: 'PLASTIC_WASTE', priority: 'HIGH',
      description: 'Floating plastic and thermocol pieces across the east side of the pond.',
      landmark: 'East steps', latitude: 10.5328, longitude: 76.2745,
      images: [photo(P2, 'Reported photo', 14)],
      status: 'REOPENED', rejectionReason: null, createdAt: daysAgo(14), updatedAt: daysAgo(8),
      history: [
        entry('SUBMITTED', 'Complaint submitted with 1 photo.', CITIZEN, C, 14),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 13),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 12),
        entry('COMPLETION_CLAIMED', 'Work completed and evidence submitted.', WORKER, W, 10),
        entry('COMMUNITY_VERIFICATION', 'Evidence reviewed. Sent for community verification.', OFFICER, O, 9),
        entry('REOPENED', 'Disputed by community: Plastic is still floating near the east steps.', CITIZEN, C, 8)
      ]
    },
    {
      id: 8, code: 'JC-1008', pondId: 3, reporterId: 1, category: 'OTHER', priority: 'LOW',
      description: 'Water level is very low in the well behind the temple.',
      landmark: 'Behind the temple', latitude: 10.5240, longitude: 76.2030, images: [],
      status: 'REJECTED', rejectionReason: 'This is a private well and is not part of the panchayat pond register.',
      createdAt: daysAgo(11), updatedAt: daysAgo(10),
      history: [
        entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 11),
        entry('REJECTED', 'Rejected: This is a private well and is not part of the panchayat pond register.', OFFICER, O, 10)
      ]
    },
    {
      id: 9, code: 'JC-1009', pondId: 5, reporterId: 1, category: 'STAGNANT_WATER', priority: 'MEDIUM',
      description: 'Inlet channel is blocked, so the north corner has stagnant water and mosquitoes.',
      landmark: 'North corner inlet', latitude: 10.5331, longitude: 76.2738, images: [],
      status: 'ASSIGNED', rejectionReason: null, createdAt: daysAgo(6), updatedAt: daysAgo(5),
      history: [
        entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 6),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 5)
      ]
    },
    {
      id: 10, code: 'JC-1010', pondId: 4, reporterId: 1, category: 'ALGAE_WEED', priority: 'MEDIUM',
      description: 'Thick green layer forming on the surface near the school side.',
      landmark: 'School side', latitude: 10.5309, longitude: 76.3292, images: [],
      status: 'SUBMITTED', rejectionReason: null, createdAt: daysAgo(0.2), updatedAt: daysAgo(0.2),
      history: [entry('SUBMITTED', 'Complaint submitted.', CITIZEN, C, 0.2)]
    },
    {
      id: 11, code: 'JC-0998', pondId: 5, reporterId: 1, category: 'BANK_DUMPING', priority: 'HIGH',
      description: 'Household waste and plastic sacks thrown down the west bank into the water.',
      landmark: 'West bank, near the fishing platform', latitude: 10.5324, longitude: 76.2736,
      images: [photo(P3, 'Reported photo', 26)],
      status: 'VERIFIED', rejectionReason: null, createdAt: daysAgo(26), updatedAt: daysAgo(19),
      history: [
        entry('SUBMITTED', 'Complaint submitted with 1 photo.', CITIZEN, C, 26),
        entry('ASSIGNED', ASSIGNED_NOTE, OFFICER, O, 25),
        entry('IN_PROGRESS', 'Inspection started.', WORKER, W, 24),
        entry('COMPLETION_CLAIMED', 'Work completed and evidence submitted.', WORKER, W, 21),
        entry('COMMUNITY_VERIFICATION', 'Evidence reviewed. Sent for community verification.', OFFICER, O, 20),
        entry('VERIFIED', 'Confirmed by community: The bank and water are clear now.', CITIZEN, C, 19)
      ]
    }
  ];

  function evidence(before, after, remarks, days) {
    return { beforeImageUrl: before, afterImageUrl: after, remarks: remarks, submittedAt: daysAgo(days) };
  }

  const tasks = [
    {
      id: 1, problemId: 1, workerId: 3, assignedById: 2, priority: 'HIGH', deadline: daysAgo(15),
      instructions: 'Clear plastic from north and east banks. Bag and hand over to Haritha Karma Sena.',
      active: true, createdAt: daysAgo(19), startedAt: daysAgo(18),
      notes: [{ text: 'Collected 6 sacks of plastic so far. Will finish east bank tomorrow.', imageUrl: null, at: daysAgo(17) }],
      evidence: evidence(P1, K1, 'All visible plastic removed from both banks. 9 sacks handed over.', 16),
      review: { decision: 'FORWARD', comment: 'Evidence acceptable.', at: daysAgo(15) },
      escalationLevel: 0, escalations: []
    },
    {
      id: 2, problemId: 2, workerId: 3, assignedById: 2, priority: 'MEDIUM', deadline: daysAgo(3),
      instructions: 'Remove water hyacinth manually from the west side. Do not use chemicals.',
      active: true, createdAt: daysAgo(8), startedAt: daysAgo(7),
      notes: [],
      evidence: evidence(P2, K3, 'Removed water hyacinth and floating waste from the western side.', 4),
      review: { decision: 'FORWARD', comment: 'Please confirm with residents.', at: daysAgo(3) },
      escalationLevel: 0, escalations: []
    },
    {
      id: 3, problemId: 3, workerId: 3, assignedById: 2, priority: 'URGENT', deadline: daysAgo(2),
      instructions: 'Identify the source of the discharge and block the outlet. Inform the health inspector.',
      active: true, createdAt: daysAgo(7), startedAt: daysAgo(5),
      notes: [{ text: 'Drain outlet traced to a nearby hotel. Owner informed; waiting for plumber.', imageUrl: null, at: daysAgo(4) }],
      evidence: null, review: null, escalationLevel: 0, escalations: []
    },
    {
      id: 4, problemId: 5, workerId: 3, assignedById: 2, priority: 'MEDIUM', deadline: daysFromNow(3),
      instructions: 'Inspect the washing ghat area and check for soap/detergent runoff.',
      active: true, createdAt: daysAgo(2), startedAt: null,
      notes: [], evidence: null, review: null, escalationLevel: 0, escalations: []
    },
    {
      id: 5, problemId: 6, workerId: 3, assignedById: 2, priority: 'HIGH', deadline: daysFromNow(1),
      instructions: 'Remove debris from the bank. Coordinate with ward member for a lorry.',
      active: true, createdAt: daysAgo(6), startedAt: daysAgo(5),
      notes: [{ text: 'Lorry arranged for Thursday.', imageUrl: null, at: daysAgo(4) }],
      evidence: evidence(P3, K2, 'Debris and waste cleared. Two loads removed by lorry.', 1),
      review: null, escalationLevel: 0, escalations: []
    },
    {
      id: 6, problemId: 7, workerId: 3, assignedById: 2, priority: 'HIGH', deadline: daysAgo(10),
      instructions: 'Remove floating plastic using the boat net.',
      active: false, createdAt: daysAgo(13), startedAt: daysAgo(12),
      notes: [],
      evidence: evidence(P2, K2, 'Floating plastic removed from east side.', 10),
      review: { decision: 'FORWARD', comment: 'Forwarded for verification.', at: daysAgo(9) },
      escalationLevel: 0, escalations: []
    },
    {
      id: 7, problemId: 9, workerId: 3, assignedById: 2, priority: 'MEDIUM', deadline: daysAgo(1),
      instructions: 'Clear the blockage in the inlet channel so water can flow.',
      active: true, createdAt: daysAgo(5), startedAt: null,
      notes: [], evidence: null, review: null, escalationLevel: 0, escalations: []
    },
    {
      id: 8, problemId: 11, workerId: 3, assignedById: 2, priority: 'HIGH', deadline: daysAgo(21),
      instructions: 'Clear the waste from the west bank and the water edge. Ask the ward member about a warning board.',
      active: true, createdAt: daysAgo(25), startedAt: daysAgo(24),
      notes: [{ text: 'About 40 kg of waste removed on day one. Rest tomorrow.', imageUrl: null, at: daysAgo(23) }],
      evidence: evidence(P3, K3, 'West bank and water edge fully cleared. Waste handed to Haritha Karma Sena.', 21),
      review: { decision: 'FORWARD', comment: 'Good work.', at: daysAgo(20) },
      escalationLevel: 0, escalations: []
    }
  ];

  const communityVerifications = [
    { id: 1, taskId: 1, problemId: 1, userId: 1, decision: 'CONFIRM', comment: 'Banks look clean now.', imageUrl: null, createdAt: daysAgo(14) },
    { id: 2, taskId: 6, problemId: 7, userId: 1, decision: 'DISPUTE', comment: 'Plastic is still floating near the east steps.', imageUrl: null, createdAt: daysAgo(8) },
    { id: 3, taskId: 8, problemId: 11, userId: 1, decision: 'CONFIRM', comment: 'The bank and water are clear now.', imageUrl: null, createdAt: daysAgo(19) }
  ];

  return {
    users: users,
    ponds: ponds,
    problems: problems,
    tasks: tasks,
    communityVerifications: communityVerifications,
    nextIds: { user: 4, pond: 6, problem: 12, task: 9, communityVerification: 4, code: 1011 }
  };
}
