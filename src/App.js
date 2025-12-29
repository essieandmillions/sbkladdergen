import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronRight, CheckCircle, Flame, DollarSign, Target, AlertTriangle, Trash2 } from 'lucide-react';

const CASHOUT_LIMIT = 50;
const WIN_TIMEOUT_MS = 3000;
const STORAGE_KEY = 'sbk_ladders';

const calculateProfit = (stake, oddsString) => {
    const trimmedOdds = String(oddsString).trim();
    if (trimmedOdds.length < 2) return 0;
    const sign = trimmedOdds.charAt(0);
    const num = parseFloat(trimmedOdds.slice(1));
    if (isNaN(num) || num <= 0) return 0;
    const oddsMagnitude = Math.abs(num);
    let profit = 0;
    if (sign === '+') profit = stake * (oddsMagnitude / 100);
    else if (sign === '-') profit = stake / (oddsMagnitude / 100);
    return parseFloat(profit.toFixed(2));
};

const App = () => {
    const [ladderNameInput, setLadderNameInput] = useState('');
    const [startStakeInput, setStartStakeInput] = useState('');
    const [goalAmountInput, setGoalAmountInput] = useState('');
    const [oddsInput, setOddsInput] = useState('');
    const [allLadders, setAllLadders] = useState([]);
    const [selectedLadderId, setSelectedLadderId] = useState(null);
    const [message, setMessage] = useState('Ready!');
    const [isSaving, setIsSaving] = useState(false);
    const [winClickState, setWinClickState] = useState('ready');
    const [isDeletePending, setIsDeletePending] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const ladders = JSON.parse(stored);
                setAllLadders(ladders);
                if (ladders.length > 0) setSelectedLadderId(ladders[0].id);
            } catch (e) { console.error('Load error:', e); }
        }
    }, []);

    useEffect(() => {
        if (allLadders.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(allLadders));
    }, [allLadders]);

    useEffect(() => {
        let timer;
        if (winClickState === 'pending') {
            timer = setTimeout(() => {
                setWinClickState('ready');
                setMessage('Expired. Tap Win again.');
            }, WIN_TIMEOUT_MS);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [winClickState]);

    const calculateLadder = useCallback((stake, goal, oddsStr) => {
        const ladder = [];
        let currentStake = parseFloat(stake);
        const finalGoal = parseFloat(goal);
        let day = 1;
        while (currentStake < finalGoal && day <= 500) {
            const profit = calculateProfit(currentStake, oddsStr);
            const nextBalance = currentStake + profit;
            ladder.push({ day, stake: currentStake, profit, nextBalance, isGoalDay: nextBalance >= finalGoal });
            if (nextBalance >= finalGoal) break;
            currentStake = nextBalance;
            day++;
        }
        return ladder;
    }, []);

    const activeLadder = useMemo(() => allLadders.find(l => l.id === selectedLadderId) || null, [allLadders, selectedLadderId]);

    const handleNewLadder = () => {
        const newName = ladderNameInput.trim();
        const newStart = parseFloat(startStakeInput.replace(/[^0-9.]/g, ''));
        const newGoal = parseFloat(goalAmountInput.replace(/[^0-9.]/g, ''));
        const newOdds = oddsInput.trim();
        if (!newName || isNaN(newStart) || isNaN(newGoal) || newStart <= 0 || newGoal <= newStart || !newOdds.match(/^[\+\-]\d+$/)) {
            setMessage('Invalid input.');
            return;
        }
        const newLadderData = calculateLadder(newStart, newGoal, newOdds);
        if (newLadderData.length === 0) { setMessage('Calculation error.'); return; }
        const newLadder = {
            id: Date.now().toString(),
            name: newName,
            startStake: newStart,
            goalAmount: newGoal,
            odds: newOdds,
            currentAmount: newStart,
            currentDayIndex: 0,
            ladderData: newLadderData,
            timestamp: new Date().toISOString()
        };
        setAllLadders(prev => [...prev, newLadder]);
        setSelectedLadderId(newLadder.id);
        setLadderNameInput(''); setStartStakeInput(''); setGoalAmountInput(''); setOddsInput('');
        setMessage(\`Created: \${newName}\`);
    };

    const handleProgressUpdate = (type) => {
        if (!activeLadder) return;
        if (type === 'WIN') {
            if (activeLadder.currentDayIndex >= activeLadder.ladderData.length) { setMessage('Goal reached!'); return; }
            const step = activeLadder.ladderData[activeLadder.currentDayIndex];
            const newAmount = step.isGoalDay ? activeLadder.goalAmount : step.nextBalance;
            setAllLadders(prev => prev.map(l => l.id === activeLadder.id ? {...l, currentAmount: newAmount, currentDayIndex: l.currentDayIndex + 1} : l));
            setMessage(step.isGoalDay ? 'GOAL REACHED!' : 'WIN!');
        } else {
            setAllLadders(prev => prev.map(l => l.id === activeLadder.id ? {...l, currentAmount: l.startStake, currentDayIndex: 0} : l));
            setMessage('LOSS - Reset');
        }
    };

    const handleWinTap = () => {
        if (!activeLadder || isSaving) return;
        if (winClickState === 'ready') {
            setWinClickState('pending');
            setMessage('Tap WIN again to confirm');
        } else {
            setWinClickState('ready');
            handleProgressUpdate('WIN');
        }
    };

    const handleDelete = () => {
        if (!activeLadder) return;
        setAllLadders(prev => prev.filter(l => l.id !== activeLadder.id));
        setSelectedLadderId(null);
        setMessage('Deleted');
        setIsDeletePending(false);
    };

    const formatCurrency = (val) => \`$\${parseFloat(val).toFixed(2)}\`;
    const isGoalReached = activeLadder && activeLadder.currentDayIndex >= activeLadder.ladderData.length;
    const isLadderReady = activeLadder && activeLadder.ladderData.length > 0;

    return (
        <div className="min-h-screen bg-gray-900 p-4 text-white">
            <div className="max-w-4xl mx-auto bg-gray-800 rounded-2xl p-6 border border-gray-700">
                <h1 className="text-4xl font-bold text-center text-sky-400 mb-6">SBK Ladder Manager</h1>
                {activeLadder && (
                    <div className="space-y-4">
                        <select value={selectedLadderId || ''} onChange={e => setSelectedLadderId(e.target.value)} className="w-full p-3 bg-gray-950 text-white rounded-lg">
                            {allLadders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <div className="bg-sky-900 p-4 rounded-xl">
                            <div className="text-3xl font-bold text-center">{formatCurrency(activeLadder.currentAmount)}</div>
                            <div className="text-center text-sm">Goal: {formatCurrency(activeLadder.goalAmount)}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={handleWinTap} disabled={isGoalReached} className={\`py-4 rounded-xl font-bold \${isGoalReached ? 'bg-gray-700' : 'bg-emerald-600'}\`}>WIN</button>
                            <button onClick={() => handleProgressUpdate('LOSS')} disabled={isGoalReached} className="py-4 rounded-xl font-bold bg-red-600">LOSS</button>
                        </div>
                    </div>
                )}
                <div className="mt-6 space-y-2">
                    <input value={ladderNameInput} onChange={e => setLadderNameInput(e.target.value)} placeholder="Ladder Name" className="w-full p-3 bg-gray-950 rounded-lg" />
                    <input value={startStakeInput} onChange={e => setStartStakeInput(e.target.value)} placeholder="Start $" className="w-full p-3 bg-gray-950 rounded-lg" />
                    <input value={goalAmountInput} onChange={e => setGoalAmountInput(e.target.value)} placeholder="Goal $" className="w-full p-3 bg-gray-950 rounded-lg" />
                    <input value={oddsInput} onChange={e => setOddsInput(e.target.value)} placeholder="Odds (+150)" className="w-full p-3 bg-gray-950 rounded-lg" />
                    <button onClick={handleNewLadder} className="w-full py-3 bg-indigo-600 rounded-lg font-bold">Create Ladder</button>
                </div>
                <div className="mt-4 text-center text-sm text-gray-400">{message}</div>
            </div>
        </div>
    );
};

export default App;