import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { X, ChevronRight, CheckCircle, Flame, DollarSign, Target, AlertTriangle, Trash2 } from 'lucide-react';

// --- Constants ---
const CASHOUT_LIMIT = 50;
const LADDER_COLLECTION_NAME = 'ladders';
const WIN_TIMEOUT_MS = 3000;

// --- Global Setup (Required by Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let firebaseConfig = {};
try {
    const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
    firebaseConfig = JSON.parse(configString);
} catch (e) {
    console.error("CRITICAL: Failed to parse __firebase_config. Using empty config.", e);
}
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// Utility function to calculate profit based on American Odds
const calculateProfit = (stake, oddsString) => {
    const trimmedOdds = String(oddsString).trim();
    if (trimmedOdds.length < 2) return 0;

    const sign = trimmedOdds.charAt(0);
    const num = parseFloat(trimmedOdds.slice(1));

    if (isNaN(num) || num <= 0) return 0;

    const oddsMagnitude = Math.abs(num);

    let profit = 0;
    if (sign === '+') {
        profit = stake * (oddsMagnitude / 100);
    } else if (sign === '-') {
        profit = stake / (oddsMagnitude / 100);
    }
    return parseFloat(profit.toFixed(2));
};

// Main App Component
const App = () => {
    // Firebase States
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [initError, setInitError] = useState(null);

    // Input States
    const [ladderNameInput, setLadderNameInput] = useState('');
    const [startStakeInput, setStartStakeInput] = useState('');
    const [goalAmountInput, setGoalAmountInput] = useState('');
    const [oddsInput, setOddsInput] = useState('');

    // Tracking States
    const [allLadders, setAllLadders] = useState([]);
    const [selectedLadderId, setSelectedLadderId] = useState(null);
    const [message, setMessage] = useState('Initializing...');
    const [isSaving, setIsSaving] = useState(false);
    const [winClickState, setWinClickState] = useState('ready');
    const [isDeletePending, setIsDeletePending] = useState(false);

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        const initFirebase = async () => {
            try {
                if (Object.keys(firebaseConfig).length === 0) {
                     setInitError('Firebase configuration is missing.');
                     setIsLoading(false);
                     return;
                }

                // Initialize Firebase SDKs
                const app = initializeApp(firebaseConfig);
                const authInstance = getAuth(app);
                const dbInstance = getFirestore(app);

                setAuth(authInstance);
                setDb(dbInstance);

                // Set up Auth State Listener
                const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                    if (!user) {
                        try {
                            if (initialAuthToken) {
                                await signInWithCustomToken(authInstance, initialAuthToken);
                            } else {
                                await signInAnonymously(authInstance);
                            }
                        } catch (error) {
                            console.error("Firebase sign-in failed:", error);
                            setInitError(`Sign-in Error: ${error.message}`);
                            setIsLoading(false);
                            return;
                        }
                    }

                    // Set User ID and mark Auth as ready
                    const currentUid = authInstance.currentUser?.uid || crypto.randomUUID();
                    setUserId(currentUid); 
                    setIsAuthReady(true);
                    setMessage('Authentication complete. Loading data...');
                });

                return () => unsubscribe();
            } catch (error) {
                console.error("CRITICAL Firebase initialization failed:", error);
                setInitError(`App Initialization Failed: ${error.message}`);
                setIsLoading(false);
            }
        };

        initFirebase();
    }, []);

    // --- Firebase Data Path and References ---
    const getLadderCollectionRef = useCallback(() => {
        if (db && userId) {
            return collection(db, `artifacts/${appId}/users/${userId}/${LADDER_COLLECTION_NAME}`);
        }
        return null;
    }, [db, userId]);

    const getLadderDocRef = useCallback((ladderId) => {
        const colRef = getLadderCollectionRef();
        if (colRef && ladderId) {
            return doc(colRef, ladderId);
        }
        return null;
    }, [getLadderCollectionRef]);

    // --- Load All Ladders from Firestore (Realtime Listener) ---
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;

        const collectionRef = getLadderCollectionRef();
        if (!collectionRef) return;

        const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
            const loadedLadders = snapshot.docs.map(doc => {
                const data = doc.data();
                const ladderData = (() => {
                    try {
                        const rawData = data.ladderData;
                        return typeof rawData === 'string' ? JSON.parse(rawData) : [];
                    } catch (e) {
                        console.error("Error parsing ladderData JSON for doc:", doc.id, e);
                        return []; 
                    }
                })();

                return {
                    id: doc.id,
                    ...data,
                    ladderData: ladderData,
                };
            });

            setAllLadders(loadedLadders);

            if (!selectedLadderId && loadedLadders.length > 0) {
                setSelectedLadderId(loadedLadders[0].id);
            } else if (selectedLadderId && !loadedLadders.some(l => l.id === selectedLadderId)) {
                setSelectedLadderId(loadedLadders.length > 0 ? loadedLadders[0].id : null);
            }

            setIsLoading(false); 

        }, (error) => {
            console.error("Error listening to ladders collection:", error);
            setMessage('Error loading ladders.');
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, userId, db, getLadderCollectionRef, selectedLadderId]);

    useEffect(() => {
        let timer;
        if (winClickState === 'pending') {
            timer = setTimeout(() => {
                setWinClickState('ready');
                setMessage('Confirmation window expired. Tap Win again.');
            }, WIN_TIMEOUT_MS);
        }

        return () => { if (timer) clearTimeout(timer); };
    }, [winClickState]); 

    const calculateLadder = useCallback((stake, goal, oddsStr) => {
        const initialStake = parseFloat(stake);
        const finalGoal = parseFloat(goal);
        const ladder = [];
        let currentStake = initialStake;
        let day = 1;
        const MAX_DAYS = 500; 

        while (currentStake < finalGoal && day <= MAX_DAYS) {
            const profit = calculateProfit(currentStake, oddsStr);
            const nextBalance = currentStake + profit;

            ladder.push({
                day,
                stake: currentStake,
                profit: profit,
                nextBalance: nextBalance,
                isGoalDay: nextBalance >= finalGoal,
            });

            if (nextBalance >= finalGoal) {
                break;
            }

            currentStake = nextBalance;
            day++;
        }
        return ladder;
    }, []);

    const activeLadder = useMemo(() => {
        return allLadders.find(l => l.id === selectedLadderId) || null;
    }, [allLadders, selectedLadderId]);

    const handleNewLadder = async () => {
        if (!db || !userId) return;

        const sanitizedStart = startStakeInput.replace(/[^0-9.]/g, '');
        const sanitizedGoal = goalAmountInput.replace(/[^0-9.]/g, '');
        const newName = ladderNameInput.trim();
        const newStart = parseFloat(sanitizedStart);
        const newGoal = parseFloat(sanitizedGoal);
        const newOdds = oddsInput.trim();

        if (!newName || isNaN(newStart) || isNaN(newGoal) || newStart <= 0 || newGoal <= newStart || !newOdds || !newOdds.match(/^[\+\-]\d+$/)) {
            setMessage('Invalid input. Check Name, Stakes (Goal > Start), and Odds (+XXX or -XXX).');
            return;
        }

        setIsSaving(true);
        try {
            const newLadderData = calculateLadder(newStart, newGoal, newOdds);
            if (newLadderData.length === 0) {
                 setMessage('Calculation error. Ladder length is zero. Check odds format (+XXX or -XXX).');
                 return;
            }

            const newLadder = {
                name: newName,
                startStake: newStart,
                goalAmount: newGoal,
                odds: newOdds,
                currentAmount: newStart, 
                currentDayIndex: 0,
                ladderData: JSON.stringify(newLadderData),
                timestamp: new Date().toISOString(),
            };

            const colRef = getLadderCollectionRef();
            if (!colRef) throw new Error("Collection reference missing.");

            const docRef = await addDoc(colRef, newLadder);

            setSelectedLadderId(docRef.id);
            setLadderNameInput('');
            setStartStakeInput('');
            setGoalAmountInput('');
            setOddsInput('');
            setMessage(`New ladder "${newName}" created.`);
        } catch (error) {
            console.error("Failed to create new ladder:", error);
            setMessage('Error creating ladder.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleProgressUpdate = async (type) => {
        if (!activeLadder || !db || isSaving) return;

        const docRef = getLadderDocRef(activeLadder.id);
        if (!docRef) return;

        setIsSaving(true);

        try {
            if (type === 'WIN') {
                if (activeLadder.currentDayIndex >= activeLadder.ladderData.length) {
                    setMessage('Goal already reached. No more steps.');
                    return;
                }

                const completedStep = activeLadder.ladderData[activeLadder.currentDayIndex];
                const newAmount = completedStep.isGoalDay ? activeLadder.goalAmount : completedStep.nextBalance;

                await updateDoc(docRef, {
                    currentAmount: newAmount,
                    currentDayIndex: activeLadder.currentDayIndex + 1,
                    timestamp: new Date().toISOString(),
                });

                setMessage(completedStep.isGoalDay ? `GOAL REACHED! Final Payout: ${formatCurrency(newAmount)}.` : `WIN confirmed! Day ${activeLadder.currentDayIndex + 1} complete.`);

            } else if (type === 'LOSS') {
                await updateDoc(docRef, {
                    currentAmount: activeLadder.startStake,
                    currentDayIndex: 0,
                    timestamp: new Date().toISOString(),
                });
                setMessage(`LOSS. Ladder "${activeLadder.name}" reset to $${activeLadder.startStake.toFixed(2)}.`);
            }
        } catch (error) {
            console.error(`Failed to handle ${type}:`, error);
            setMessage(`Error processing ${type}.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleWinTap = () => {
        if (!isLadderReady || isGoalReached || isSaving) return;

        if (winClickState === 'ready') {
            setWinClickState('pending');
            setMessage(`Tap WIN again to confirm Step ${activeLadder.currentDayIndex + 1} success.`);

        } else if (winClickState === 'pending') {
            setWinClickState('ready');
            handleProgressUpdate('WIN');
        }
    };

    const handleConfirmDelete = async () => {
        if (!activeLadder || !db || !isDeletePending) return;

        setIsSaving(true);
        try {
            const docRef = getLadderDocRef(activeLadder.id);
            if (!docRef) throw new Error("Document reference missing.");
            await deleteDoc(docRef);
            setSelectedLadderId(null); 
            setMessage(`Ladder "${activeLadder.name}" deleted.`);
        } catch (error) {
            console.error("Failed to delete ladder:", error);
            setMessage('Error deleting ladder.');
        } finally {
            setIsSaving(false);
            setIsDeletePending(false);
        }
    };

    const formatCurrency = (value) => `$${parseFloat(value).toFixed(2)}`;

    const isCashoutAvailable = activeLadder && activeLadder.currentAmount >= CASHOUT_LIMIT && activeLadder.currentDayIndex < activeLadder.ladderData.length;
    const nextDayStake = activeLadder?.ladderData[activeLadder.currentDayIndex]?.stake || (activeLadder?.currentDayIndex >= activeLadder?.ladderData.length ? activeLadder?.goalAmount : activeLadder?.startStake);
    const nextStepInfo = activeLadder?.ladderData[activeLadder.currentDayIndex];
    const isGoalReached = activeLadder && activeLadder.currentDayIndex >= activeLadder.ladderData.length;
    const isLadderReady = activeLadder && activeLadder.ladderData.length > 0;
    const daysCompleted = activeLadder?.currentDayIndex || 0;
    const totalDays = activeLadder?.ladderData.length || 0;

    const renderLadderTable = useMemo(() => {
        if (!isLadderReady) return null;

        const { ladderData, currentDayIndex, odds } = activeLadder;

        const tableHeaderClasses = "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider bg-gray-950";

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-950">
                        <tr>
                            <th className={tableHeaderClasses}>Day</th>
                            <th className={tableHeaderClasses}>Stake</th>
                            <th className={tableHeaderClasses}>Profit ({odds})</th>
                            <th className={tableHeaderClasses}>New Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {ladderData.map((step) => {
                            const isCurrent = step.day === currentDayIndex + 1 && !isGoalReached;
                            const isCompleted = step.day <= currentDayIndex;

                            const profitTextColor = isCompleted ? 'text-emerald-400' : 'text-gray-400';

                            const rowClasses = isCompleted
                                ? 'bg-emerald-900/10 text-emerald-300 opacity-90'
                                : isCurrent
                                ? 'bg-sky-900/40 text-sky-300 font-semibold border-l-4 border-sky-500'
                                : 'text-gray-200 hover:bg-gray-800 transition duration-100';

                            return (
                                <tr key={step.day} className={rowClasses}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm flex items-center">{step.day} {step.isGoalDay && (<Flame size={14} className="ml-1 text-red-400" />)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">{formatCurrency(step.stake)}</td>
                                    <td className={`px-4 py-3 whitespace-nowrap text-sm ${profitTextColor}`}>{formatCurrency(step.profit)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{formatCurrency(step.nextBalance)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }, [isLadderReady, activeLadder, isGoalReached, activeLadder?.currentDayIndex]); 

    if (initError) {
        return (
            <div className="min-h-screen bg-red-950 flex items-center justify-center font-inter text-white p-4">
                <div className="text-center p-8 rounded-2xl bg-red-800 border-4 border-red-500 shadow-2xl">
                    <AlertTriangle className="h-12 w-12 text-red-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-red-100 mb-2">CRITICAL APP ERROR</h2>
                    <p className="text-sm text-red-200 mb-4">The application failed to initialize or authenticate with Firebase.</p>
                    <p className="text-xs text-red-300 font-mono break-all">{initError}</p>
                    <p className="mt-4 text-xs text-red-400">If this persists, please provide the console log for further debugging.</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center font-inter text-white">
                <div className="text-center p-8 rounded-2xl bg-gray-800 shadow-2xl border border-gray-700">
                    <svg className="animate-spin h-8 w-8 text-sky-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-gray-400 font-semibold">{message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 p-4 sm:p-6 font-inter flex justify-center text-white relative">
            <div className="w-full max-w-4xl bg-gray-900/95 backdrop-blur-sm shadow-2xl rounded-2xl p-6 space-y-8 border border-gray-800 pb-32">
                <h1 className="text-4xl font-extrabold text-center text-sky-400 pt-2 pb-1">EssieSbk Ladder Manager</h1>

                <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                    <p className="text-sm text-gray-500 font-medium">Multi-Step Progress Tracker</p>
                    {userId && (
                        <div className="text-xs text-right text-gray-500">
                            Session ID: <span className="font-mono text-gray-400 break-all">{userId}</span>
                        </div>
                    )}
                </div>

                <div className="p-4 rounded-xl bg-gray-800 border border-sky-700/50 shadow-inner">
                    <label htmlFor="ladder-selector" className="block text-sm font-medium text-gray-300 mb-2">Select Active Ladder</label>
                    <div className="flex space-x-2">
                        <select
                            id="ladder-selector"
                            value={selectedLadderId || ''}
                            onChange={(e) => {
                                setSelectedLadderId(e.target.value);
                                setIsDeletePending(false);
                            }}
                            className="flex-grow rounded-lg border-gray-700 bg-gray-950 text-white shadow-sm p-3 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60"
                            disabled={allLadders.length === 0 || isSaving}
                        >
                            {allLadders.length === 0 ? (
                                <option value="" disabled>-- No ladders available --</option>
                            ) : (
                                allLadders.map(ladder => (
                                    <option key={ladder.id} value={ladder.id}>
                                        {ladder.name} ({formatCurrency(ladder.currentAmount)} / Goal: {formatCurrency(ladder.goalAmount)})
                                    </option>
                                ))
                            )}
                        </select>
                        <button
                            onClick={() => setIsDeletePending(true)}
                            disabled={!activeLadder || isSaving || isDeletePending}
                            className={`py-3 px-4 rounded-lg shadow-md text-sm font-medium transition duration-150 flex items-center justify-center ${
                                !activeLadder || isSaving || isDeletePending
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                            }`}
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                    {isDeletePending && activeLadder && (
                        <div className="mt-3 p-3 bg-red-900/50 rounded-lg flex justify-between items-center">
                            <p className="text-sm text-red-200">Confirm deletion of **{activeLadder.name}**?</p>
                            <div className="space-x-2">
                                <button 
                                    onClick={handleConfirmDelete} 
                                    disabled={isSaving}
                                    className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
                                >
                                    Delete
                                </button>
                                <button 
                                    onClick={() => setIsDeletePending(false)} 
                                    className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <h2 className="text-xl font-bold text-gray-300 border-t border-gray-700 pt-6">Create New Ladder</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border p-4 rounded-xl bg-gray-800 border-indigo-700/50 shadow-inner">
                    <div className="col-span-2 sm:col-span-4">
                        <label htmlFor="ladderName" className="block text-sm font-medium text-gray-300">Ladder Name</label>
                        <input
                            id="ladderName"
                            type="text"
                            value={ladderNameInput}
                            onChange={(e) => setLadderNameInput(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-700 bg-gray-950 text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Monthly High Roller"
                            disabled={isSaving}
                        />
                    </div>
                    <div>
                        <label htmlFor="startStake" className="block text-sm font-medium text-gray-300">Start ($)</label>
                        <input
                            id="startStake"
                            type="text"
                            inputMode="decimal"
                            value={startStakeInput}
                            onChange={(e) => setStartStakeInput(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-700 bg-gray-950 text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="100.00"
                            disabled={isSaving}
                        />
                    </div>
                    <div>
                        <label htmlFor="goalAmount" className="block text-sm font-medium text-gray-300">Goal ($)</label>
                        <input
                            id="goalAmount"
                            type="text"
                            inputMode="decimal"
                            value={goalAmountInput}
                            onChange={(e) => setGoalAmountInput(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-700 bg-gray-950 text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="1000.00"
                            disabled={isSaving}
                        />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label htmlFor="odds" className="block text-sm font-medium text-gray-300">American Odds</label>
                        <input
                            id="odds"
                            type="text"
                            value={oddsInput}
                            onChange={(e) => setOddsInput(e.target.value)}
                            className="mt-1 block w-full rounded-lg border-gray-700 bg-gray-950 text-white shadow-sm p-3 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="+150 or -110"
                            disabled={isSaving}
                        />
                    </div>
                    <div className="sm:col-span-1 flex items-end">
                        <button
                            onClick={handleNewLadder}
                            disabled={isSaving || !ladderNameInput.trim() || !startStakeInput.trim() || !goalAmountInput.trim() || !oddsInput.trim()}
                            className="w-full py-3 px-4 rounded-lg shadow-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900 transition duration-150 disabled:bg-indigo-900 disabled:text-gray-500"
                        >
                           {isSaving ? 'Calculating...' : 'Create New Ladder'}
                        </button>
                    </div>
                </div>

                {activeLadder ? (
                    <div className="space-y-4 pt-4">
                        {isCashoutAvailable && (
                            <div className="p-4 rounded-xl border border-amber-500 bg-amber-900/40 text-center shadow-md flex items-center justify-center space-x-2">
                                <DollarSign className="text-amber-300" size={24} />
                                <p className="font-extrabold text-xl text-amber-300">CASHOUT REMINDER!</p>
                                <p className="text-sm text-amber-200 ml-3 hidden sm:inline">
                                    Balance is {formatCurrency(activeLadder.currentAmount)} (over {formatCurrency(CASHOUT_LIMIT)}).
                                </p>
                            </div>
                        )}

                        <div className="bg-sky-900/70 p-4 rounded-xl text-white shadow-xl shadow-sky-900/50">
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <div className="text-4xl font-bold text-sky-200">{formatCurrency(activeLadder.currentAmount)}</div>
                                    <div className="text-sm opacity-80 mt-1">Current Balance</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-bold text-sky-200">{daysCompleted} / {totalDays}</div>
                                    <div className="text-sm opacity-80 mt-1">Steps Completed (Goal: {formatCurrency(activeLadder.goalAmount)})</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl shadow-md border-l-4 border-sky-500 bg-gray-800 text-gray-100">
                            {isGoalReached ? (
                                <p className="text-center font-bold text-xl text-emerald-400 flex items-center justify-center space-x-2">
                                    <CheckCircle size={24} />
                                    <span>GOAL REACHED! Final Balance: {formatCurrency(activeLadder.currentAmount)}</span>
                                </p>
                            ) : nextStepInfo ? (
                                <div>
                                    <p className="text-center font-bold text-sm text-gray-400">Next Stake (Day {activeLadder.currentDayIndex + 1})</p>
                                    <p className="text-center text-5xl font-extrabold text-sky-400 mt-1">{formatCurrency(nextDayStake)}</p>

                                    <div className="mt-4 pt-3 border-t border-gray-700">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-sm font-semibold text-gray-300">Target Profit ({activeLadder.odds})</p>
                                            <p className="text-xl font-bold text-emerald-400">+{formatCurrency(nextStepInfo.profit)}</p>
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t border-gray-700/50">
                                            <p className="text-sm font-semibold text-gray-300 flex items-center">
                                                Target Payout 
                                                {nextStepInfo.isGoalDay && <Target size={16} className="ml-2 text-red-400" />}
                                            </p>
                                            <p className="text-2xl font-bold text-indigo-300">{formatCurrency(nextStepInfo.nextBalance)}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                 <p className="text-center font-medium text-gray-400">Selected ladder structure is empty or invalid.</p>
                            )}
                        </div>

                        {message && (
                            <div className="p-3 text-center text-sm font-medium rounded-lg bg-gray-800 border border-gray-700 text-gray-300">
                                {message}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-400 bg-gray-800 rounded-xl border border-gray-700">
                        <p className="text-lg font-semibold mb-2">No Active Ladder</p>
                        <p>Select an existing ladder or use the form above to create your first one!</p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4">
                    <button
                        onClick={handleWinTap}
                        disabled={!isLadderReady || isGoalReached || isSaving || isDeletePending}
                        className={`py-4 rounded-xl shadow-lg font-bold text-lg transition duration-300 transform active:scale-95 flex items-center justify-center space-x-2 ${
                            (!isLadderReady || isGoalReached || isSaving || isDeletePending)
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : winClickState === 'pending'
                                    ? 'bg-sky-600 text-white border-4 border-sky-400' 
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-900/30 hover:shadow-xl'
                        }`}
                    >
                        {winClickState === 'pending' ? (
                            <>
                                <CheckCircle size={24} />
                                <span>CONFIRM WIN (Tap Again)</span>
                            </>
                        ) : (
                            <>
                                <ChevronRight size={24} />
                                <span>Win (Green Out)</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => handleProgressUpdate('LOSS')}
                        disabled={!isLadderReady || isGoalReached || isSaving || winClickState === 'pending' || isDeletePending}
                        className={`py-4 rounded-xl shadow-lg font-bold text-lg transition duration-300 transform active:scale-95 ${
                            (!isLadderReady || isGoalReached || isSaving || winClickState === 'pending' || isDeletePending)
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-900/30 hover:shadow-xl'
                        }`}
                    >
                        Loss (Restart Ladder)
                    </button>
                </div>

                <h2 className="text-xl font-bold text-gray-300 pt-8 border-t border-gray-700 mt-8">
                    {activeLadder ? `Full Ladder Steps for "${activeLadder.name}"` : 'Ladder Steps Preview'}
                </h2>
                {isLadderReady ? (
                    <div className="border border-gray-700 rounded-xl overflow-hidden shadow-inner bg-gray-800">
                        {renderLadderTable}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 p-4 border border-gray-700 rounded-xl bg-gray-800">
                        {activeLadder ? 'Ladder structure ready, but no steps calculated or data loading.' : 'Select or create a ladder to see its projected steps.'}
                    </p>
                )}
            </div>
        </div>
    );
};

export default App;