import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Settings, Moon, Sun, Clock, RefreshCw, AlertCircle, CheckCircle, Plus, Trash2, LogOut, Lock, Download, Upload, Edit2, Save, X, Eye, Users, FileSpreadsheet, Activity, Maximize2, Minimize2 } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from './lib/supabase';

// ============================================
// 定数定義
// ============================================

const POSITIONS = {
  師長: { name: '師長', color: 'bg-rose-100 text-rose-700 border-rose-200', priority: 1 },
  主任: { name: '主任', color: 'bg-amber-100 text-amber-700 border-amber-200', priority: 2 },
  副主任: { name: '副主任', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', priority: 3 },
  一般: { name: '一般', color: 'bg-slate-100 text-slate-600 border-slate-200', priority: 4 }
};

const SHIFT_TYPES = {
  日: { name: '日勤', hours: 7.5, color: 'bg-blue-100 text-blue-700' },
  夜: { name: '夜勤', hours: 14.5, color: 'bg-purple-100 text-purple-700' },
  明: { name: '夜明', hours: 0, color: 'bg-pink-100 text-pink-700' },
  管夜: { name: '管理夜勤', hours: 14.5, color: 'bg-teal-100 text-teal-700' },
  管明: { name: '管理夜明', hours: 0, color: 'bg-cyan-100 text-cyan-700' },
  休: { name: '公休', hours: 0, color: 'bg-gray-100 text-gray-600' },
  有: { name: '有休', hours: 0, color: 'bg-emerald-100 text-emerald-700' },
  午前半: { name: '午前半休', hours: 3.75, color: 'bg-lime-100 text-lime-700' },
  午後半: { name: '午後半休', hours: 3.75, color: 'bg-orange-100 text-orange-700' },
};

const VALID_SHIFTS = ['日', '夜', '明', '管夜', '管明', '休', '有', '午前半', '午後半'];
const sanitizeShift = (s: any): string | null => {
  if (!s) return null;
  const str = String(s).trim();
  if (str === '午前半' || str === '前半' || str === 'AM半') return '午前半';
  if (str === '午後半' || str === '後半' || str === 'PM半') return '午後半';
  return VALID_SHIFTS.includes(str) ? str : null;
};

// Supabase DB操作関数（prefix で部門テーブルを切り替え）
const createDBFunctions = (prefix: string) => {
  const t = (name: string) => `${prefix}_${name}`;

  const fetchNursesFromDB = async () => {
    const { data, error } = await supabase.from(t('nurses')).select('*').order('id');
    if (error) throw error;
    return data || [];
  };
  const upsertNurseToDB = async (nurse: any) => {
    const { error } = await supabase.from(t('nurses')).upsert(nurse, { onConflict: 'id' });
    if (error) throw error;
  };
  const deleteNurseFromDB = async (id: number) => {
    const { error } = await supabase.from(t('nurses')).delete().eq('id', id);
    if (error) throw error;
  };
  const fetchRequestsFromDB = async (year: number, month: number) => {
    const { data, error } = await supabase.from(t('requests')).select('*').eq('year', year).eq('month', month);
    if (error) throw error;
    return data || [];
  };
  const upsertRequestToDB = async (nurseId: number, year: number, month: number, day: number, shiftType: string) => {
    const { error } = await supabase.from(t('requests')).upsert(
      { nurse_id: nurseId, year, month, day, shift_type: shiftType },
      { onConflict: 'nurse_id,year,month,day' }
    );
    if (error) throw error;
  };
  const deleteRequestFromDB = async (nurseId: number, year: number, month: number, day: number) => {
    const { error } = await supabase.from(t('requests')).delete()
      .eq('nurse_id', nurseId).eq('year', year).eq('month', month).eq('day', day);
    if (error) throw error;
  };
  const fetchSchedulesFromDB = async (year: number, month: number) => {
    const { data, error } = await supabase.from(t('schedules')).select('*').eq('year', year).eq('month', month);
    if (error) throw error;
    return data || [];
  };
  const saveSchedulesToDB = async (year: number, month: number, scheduleData: Record<number, (string | null)[]>) => {
    await supabase.from(t('schedules')).delete().eq('year', year).eq('month', month);
    const rows: any[] = [];
    Object.entries(scheduleData).forEach(([nurseId, shifts]) => {
      (shifts as (string | null)[]).forEach((shift, dayIndex) => {
        if (shift) rows.push({ nurse_id: parseInt(nurseId), year, month, day: dayIndex + 1, shift });
      });
    });
    if (rows.length > 0) {
      const { error } = await supabase.from(t('schedules')).insert(rows);
      if (error) throw error;
    }
  };
  const updateScheduleCellInDB = async (nurseId: number, year: number, month: number, day: number, shift: string | null) => {
    if (shift) {
      await supabase.from(t('schedules')).upsert(
        { nurse_id: nurseId, year, month, day, shift },
        { onConflict: 'nurse_id,year,month,day' }
      );
    } else {
      await supabase.from(t('schedules')).delete()
        .eq('nurse_id', nurseId).eq('year', year).eq('month', month).eq('day', day);
    }
  };
  const fetchSettingFromDB = async (key: string) => {
    const { data, error } = await supabase.from(t('settings')).select('value').eq('key', key).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.value || null;
  };
  const saveSettingToDB = async (key: string, value: string) => {
    await supabase.from(t('settings')).upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  };

  return {
    t, fetchNursesFromDB, upsertNurseToDB, deleteNurseFromDB,
    fetchRequestsFromDB, upsertRequestToDB, deleteRequestFromDB,
    fetchSchedulesFromDB, saveSchedulesToDB, updateScheduleCellInDB,
    fetchSettingFromDB, saveSettingToDB,
  };
};

// ============================================
// ユーティリティ関数
// ============================================

// 固定アクセスコード生成（ID + 名前から常に同じコードを生成）
const generateFixedAccessCode = (id, name) => {
  let hash = 0;
  const str = `${id}-${name}-hcu2025`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const code = Math.abs(hash % 900000) + 100000;
  return String(code);
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const getDayOfWeek = (year, month, day) => {
  const d = new Date(year, month, day);
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
};

// 日本の祝日を取得（年と月を指定、1-based dayの配列を返す）
const getJapaneseHolidays = (year: number, month: number): number[] => {
  // month は 0-based (0=1月, 11=12月)
  const holidays: number[] = [];
  const m = month + 1;

  if (m === 1) { holidays.push(1); holidays.push(11); }
  if (m === 2) holidays.push(23);
  if (m === 3) holidays.push(21);
  if (m === 4) holidays.push(29);
  if (m === 5) { holidays.push(3); holidays.push(4); holidays.push(5); }
  if (m === 7) holidays.push(20);
  if (m === 8) holidays.push(11);
  if (m === 9) { holidays.push(16); holidays.push(23); }
  if (m === 10) holidays.push(14);
  if (m === 11) { holidays.push(3); holidays.push(23); }

  const getNthMonday = (y: number, mo: number, n: number): number => {
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const date = new Date(y, mo, d);
      if (date.getMonth() !== mo) break;
      if (date.getDay() === 1) { count++; if (count === n) return d; }
    }
    return 1;
  };

  if (m === 1) { const idx = holidays.indexOf(11); if (idx >= 0) holidays[idx] = getNthMonday(year, 0, 2); }
  if (m === 7) { const idx = holidays.indexOf(20); if (idx >= 0) holidays[idx] = getNthMonday(year, 6, 3); }
  if (m === 9) { const idx = holidays.indexOf(16); if (idx >= 0) holidays[idx] = getNthMonday(year, 8, 3); }
  if (m === 10) { const idx = holidays.indexOf(14); if (idx >= 0) holidays[idx] = getNthMonday(year, 9, 2); }

  if (m === 3) {
    const idx = holidays.indexOf(21);
    const spring = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    if (idx >= 0) holidays[idx] = spring;
  }
  if (m === 9) {
    const idx = holidays.indexOf(23);
    const autumn = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    if (idx >= 0) holidays[idx] = autumn;
  }

  const extraHolidays: number[] = [];
  holidays.forEach(d => {
    const date = new Date(year, month, d);
    if (date.getDay() === 0) {
      const next = d + 1;
      const daysInM = new Date(year, month + 1, 0).getDate();
      if (next <= daysInM && !holidays.includes(next)) extraHolidays.push(next);
    }
  });

  return [...holidays, ...extraHolidays].filter(d => d >= 1 && d <= new Date(year, month + 1, 0).getDate());
};

const isWeekend = (year, month, day) => {
  const d = new Date(year, month, day);
  return d.getDay() === 0 || d.getDay() === 6;
};

interface ScheduleVersion {
  id: string;
  version: number;
  timestamp: string;
  data: Record<number, (string | null)[]>;
}

// ============================================
// メインコンポーネント
// ============================================

const HcuScheduleSystem = ({ department = 'HCU', onBack }: { department?: 'HCU' | 'ER'; onBack?: () => void }) => {
  const departmentName = department === 'ER' ? '救急外来' : 'HCU';
  const dbPrefix = department === 'ER' ? 'emergency' : 'hcu';
  const {
    t: getTableName, fetchNursesFromDB, upsertNurseToDB, deleteNurseFromDB,
    fetchRequestsFromDB, upsertRequestToDB, deleteRequestFromDB,
    fetchSchedulesFromDB, saveSchedulesToDB, updateScheduleCellInDB,
    fetchSettingFromDB, saveSettingToDB,
  } = createDBFunctions(dbPrefix);
  // システムモード: 'select' | 'admin' | 'dashboard' | 'adminSchedule' | 'staff'
  const [systemMode, setSystemMode] = useState('select');
  
  // ダッシュボード用
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());
  
  // 管理者認証
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  
  // 職員認証
  const [staffNurseId, setStaffNurseId] = useState(null);
  const [staffCode, setStaffCode] = useState('');
  const [staffError, setStaffError] = useState('');
  
  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);

  // 対象年月
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth());
  
  // 看護師データ（Supabase永続化）
  const [nurses, setNurses] = useState<any[]>([]);
  
  // 休み希望データ（Supabase永続化）
  const [requests, setRequests] = useState<Record<string, any>>({});
  
  // 勤務表データ
  const [schedule, setSchedule] = useState<any>(null);
  // 手動「夜」設定時に翌日・翌々日の元値を保存（セッション中のみ有効）
  const nightBackupRef = useRef<Record<string, string | null>>({});
  
  // UI状態
  const [showSettings, setShowSettings] = useState(false);
  const [showRequestReview, setShowRequestReview] = useState(false);
  // 希望未提出者一覧
  const [showUnsubmitted, setShowUnsubmitted] = useState(false);
  // 管理者編集前のオリジナルリクエストを追跡
  const [originalRequests, setOriginalRequests] = useState<Record<string, any>>({});
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [editingNurse, setEditingNurse] = useState(null);
  const [showAddNurse, setShowAddNurse] = useState(false);
  const [newNurseData, setNewNurseData] = useState({ name: '', position: '一般' });
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 削除確認用
  const [showGenerateConfig, setShowGenerateConfig] = useState(false); // 生成設定モーダル
  const [isMaximized, setIsMaximized] = useState(false); // 勤務表最大化
  const [showDeadlineSettings, setShowDeadlineSettings] = useState(false); // 締め切り設定モーダル
  const [showPasswordChange, setShowPasswordChange] = useState(false); // パスワード変更モーダル
  const [storedAdminPassword, setStoredAdminPassword] = useState('admin123'); // DB保存パスワード
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // 保存状態管理
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 提出期限設定
  const [requestDeadline, setRequestDeadline] = useState({ day: 14, hour: 11, minute: 59 });
  
  // 勤務表生成設定
  const [generateConfig, setGenerateConfig] = useState({
    nightShiftPattern: [4, 4], // 週ごとの夜勤人数パターン（交互）
    startWithThree: false, // 第1週を2人から開始
    maxNightShifts: 6, // 個人の最大夜勤回数
    maxDaysOff: 10, // 最大休日数（病院規定: この日数以下にする）
    maxConsecutiveDays: 3, // 最大連続勤務日数（厳格制約: 3日）
    // 日勤者数設定
    weekdayDayStaff: 6, // 平日の日勤者数（目標6人、6-8人許容）
    weekendDayStaff: 5, // 土日の日勤者数（厳格: 5人）
    yearEndDayStaff: 4, // 年末（12/30-31）の日勤者数
    newYearDayStaff: 4  // 年始（1/1-3）の日勤者数
  });
  
  // 前月データ関連（確定済み）
  const [previousMonthData, setPreviousMonthData] = useState<any>(null);
  const [prevMonthConstraints, setPrevMonthConstraints] = useState<any>({});
  
  // 職員別シフト設定: { nurseId: { maxNightShifts: number, noNightShift: boolean, noDayShift: boolean } }
  const [nurseShiftPrefs, setNurseShiftPrefs] = useState<Record<number, { maxNightShifts: number; noNightShift: boolean; noDayShift: boolean; excludeFromMaxDaysOff: boolean; maxRequests: number }>>({});
  const [showNurseShiftPrefs, setShowNurseShiftPrefs] = useState(false);
  
  // 前月データ関連（プレビュー用）
  const [showPrevMonthImport, setShowPrevMonthImport] = useState(false);
  const [showPrevMonthReview, setShowPrevMonthReview] = useState(false);
  const [prevMonthRawData, setPrevMonthRawData] = useState([]); // Excelから読み込んだ生データ [{name, shifts}]
  const [prevMonthMapping, setPrevMonthMapping] = useState({}); // { nurseId: excelRowIndex } マッピング
  
  // バージョン管理
  const [scheduleVersions, setScheduleVersions] = useState<ScheduleVersion[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [nextVersionNumber, setNextVersionNumber] = useState(1);

  // Excel読み込み用
  const [excelData, setExcelData] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [importConfig, setImportConfig] = useState({
    startRow: 2,
    endRow: 30,
    nameColumn: 'C',
    positionColumn: 'D'
  });

  // Supabaseからデータ読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const dbNurses = await fetchNursesFromDB();
        if (dbNurses.length > 0) {
          setNurses(dbNurses);
        }
        const dbRequests = await fetchRequestsFromDB(targetYear, targetMonth);
        const reqMap: Record<string, any> = {};
        dbRequests.forEach((r: any) => {
          const monthKey = `${r.year}-${r.month}`;
          if (!reqMap[monthKey]) reqMap[monthKey] = {};
          if (!reqMap[monthKey][r.nurse_id]) reqMap[monthKey][r.nurse_id] = {};
          if (r.shift_type) reqMap[monthKey][r.nurse_id][r.day] = r.shift_type;
        });
        setRequests(reqMap);

        const dbSchedules = await fetchSchedulesFromDB(targetYear, targetMonth);
        if (dbSchedules.length > 0) {
          const days = getDaysInMonth(targetYear, targetMonth);
          const schedData: Record<number, (string | null)[]> = {};
          const invalidRows: any[] = [];
          dbSchedules.forEach((s: any) => {
            if (!schedData[s.nurse_id]) schedData[s.nurse_id] = new Array(days).fill(null);
            const clean = sanitizeShift(s.shift);
            schedData[s.nurse_id][s.day - 1] = clean;
            if (!clean && s.shift) invalidRows.push(s); // DB上に不正値あり
          });
          // 不正値をDBから削除
          if (invalidRows.length > 0) {
            console.log(`不正シフト値を${invalidRows.length}件削除:`, invalidRows.map(r => r.shift));
            for (const r of invalidRows) {
              await supabase.from(getTableName('schedules')).delete()
                .eq('nurse_id', r.nurse_id).eq('year', r.year).eq('month', r.month).eq('day', r.day);
            }
          }
          // 有効データが残っているか確認
          const hasValidData = Object.values(schedData).some(arr => (arr as any[]).some(v => v !== null));
          if (hasValidData) {
            setSchedule({ month: `${targetYear}-${targetMonth}`, data: schedData });
          } else {
            setSchedule(null);
          }
        } else {
          setSchedule(null);
        }

        // 前月データの読み込み（月別キーで保存）
        const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
        const savedPrevData = await fetchSettingFromDB(pmKey);
        if (savedPrevData) {
          try {
            const parsed = JSON.parse(savedPrevData);
            const pmData = parsed.data || null;
            setPreviousMonthData(pmData);
            // 制約は常にデータから再計算（旧0ベースデータとの互換性確保）
            if (pmData) {
              const reCalc = {};
              Object.entries(pmData).forEach(([nurseId, shifts]: [string, any]) => {
                if (!shifts || shifts.length === 0) return;
                const last = shifts[shifts.length - 1];
                reCalc[nurseId] = {};
                if (last === '夜') {
                  reCalc[nurseId][1] = '明'; reCalc[nurseId][2] = '休';
                } else if (last === '管夜') {
                  reCalc[nurseId][1] = '管明'; reCalc[nurseId][2] = '休';
                } else if (last === '明' || last === '管明') {
                  reCalc[nurseId][1] = '休';
                }
              });
              setPrevMonthConstraints(reCalc);
            } else {
              setPrevMonthConstraints({});
            }
          } catch(e) { console.error('前月データ解析エラー:', e); }
        }

        // 職員別シフト設定の読み込み
        const savedPrefs = await fetchSettingFromDB('nurseShiftPrefs');
        if (savedPrefs) {
          try {
            setNurseShiftPrefs(JSON.parse(savedPrefs));
          } catch(e) { console.error('職員設定解析エラー:', e); }
        }

        // 管理者パスワードの読み込み
        const savedPw = await fetchSettingFromDB('adminPassword');
        if (savedPw) {
          setStoredAdminPassword(savedPw);
        }
      } catch (error: any) {
        console.error('データ読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [targetYear, targetMonth]);

  // ページ離脱時の確認ダイアログ
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // バージョン管理: 月切り替え時にバージョンを読み込み
  useEffect(() => {
    loadVersionsFromLocalStorage(targetYear, targetMonth);
  }, [targetYear, targetMonth]);

  // 保存ラッパー関数（保存状態管理 + LocalStorageバックアップ）
  const saveWithStatus = async (saveFn: () => Promise<void>) => {
    setSaveStatus('saving');
    try {
      await saveFn();
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      // 3秒後にidle状態に戻す
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error('保存エラー:', e);
      setSaveStatus('error');
      setHasUnsavedChanges(true);
    }
  };

  // LocalStorageバックアップ保存
  const saveScheduleToLocalStorage = (scheduleData: any) => {
    try {
      const key = `hcu-schedule-backup-${targetYear}-${targetMonth}`;
      localStorage.setItem(key, JSON.stringify(scheduleData));
    } catch (e) {
      console.error('LocalStorage保存エラー:', e);
    }
  };

  // LocalStorageバックアップ復元
  const loadScheduleFromLocalStorage = () => {
    try {
      const key = `hcu-schedule-backup-${targetYear}-${targetMonth}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('LocalStorage読み込みエラー:', e);
      return null;
    }
  };

  // LocalStorageバックアップ削除
  const clearScheduleFromLocalStorage = () => {
    try {
      const key = `hcu-schedule-backup-${targetYear}-${targetMonth}`;
      localStorage.removeItem(key);
    } catch (e) {
      console.error('LocalStorage削除エラー:', e);
    }
  };

  // バージョン管理: LocalStorage読み込み
  const loadVersionsFromLocalStorage = (year: number, month: number) => {
    try {
      const key = `scheduleVersions-${department}-${year}-${month}`;
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        setScheduleVersions(parsed.versions || []);
        setNextVersionNumber(parsed.nextVersionNumber || 1);
      } else {
        setScheduleVersions([]);
        setNextVersionNumber(1);
      }
    } catch (e) {
      console.error('バージョン読み込みエラー:', e);
      setScheduleVersions([]);
      setNextVersionNumber(1);
    }
  };

  // バージョン管理: LocalStorage保存
  const saveVersionsToLocalStorage = (versions: ScheduleVersion[], nextVer: number) => {
    try {
      const key = `scheduleVersions-${department}-${targetYear}-${targetMonth}`;
      localStorage.setItem(key, JSON.stringify({ versions, nextVersionNumber: nextVer }));
    } catch (e) {
      console.error('バージョン保存エラー:', e);
    }
  };

  // DBから最新のリクエストデータを再読み込み
  const reloadRequestsFromDB = async () => {
    try {
      const dbRequests = await fetchRequestsFromDB(targetYear, targetMonth);
      const reqMap: Record<string, any> = {};
      dbRequests.forEach((r: any) => {
        const monthKey = `${r.year}-${r.month}`;
        if (!reqMap[monthKey]) reqMap[monthKey] = {};
        if (!reqMap[monthKey][r.nurse_id]) reqMap[monthKey][r.nurse_id] = {};
        reqMap[monthKey][r.nurse_id][r.day] = r.shift_type;
      });
      setRequests(reqMap);
      return reqMap;
    } catch (e) {
      console.error('リクエスト再読み込みエラー:', e);
      return null;
    }
  };

  // nursesの変更をSupabaseに保存
  const saveNurseToDB = async (nurseData: any) => {
    try { await upsertNurseToDB(nurseData); } catch (e) { console.error('保存エラー:', e); }
  };

  // requestsの変更をSupabaseに保存
  const saveRequestToDB = async (nurseId: number, year: number, month: number, day: number, shiftType: string | null) => {
    if (shiftType) {
      await upsertRequestToDB(nurseId, year, month, day, shiftType);
    } else {
      await deleteRequestFromDB(nurseId, year, month, day);
    }
  };

  // 計算値
  const activeNurses = useMemo(() => 
    nurses.filter(n => n.active).sort((a, b) => 
      (POSITIONS[a.position]?.priority || 99) - (POSITIONS[b.position]?.priority || 99)
    ), [nurses]);
  
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  
  // 各看護師にアクセスコードを付与
  const nursesWithCodes = useMemo(() => 
    activeNurses.map(n => ({
      ...n,
      accessCode: generateFixedAccessCode(n.id, n.name)
    })), [activeNurses]);

  // ============================================
  // バージョン管理機能
  // ============================================

  const saveCurrentAsVersion = () => {
    if (!schedule?.data) return;
    const newVersion: ScheduleVersion = {
      id: Date.now().toString(),
      version: nextVersionNumber,
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(schedule.data)),
    };
    let updated = [...scheduleVersions, newVersion];
    if (updated.length > 10) {
      updated = updated.slice(updated.length - 10);
    }
    const newNextVer = nextVersionNumber + 1;
    setScheduleVersions(updated);
    setNextVersionNumber(newNextVer);
    saveVersionsToLocalStorage(updated, newNextVer);
  };

  const restoreVersion = async (id: string) => {
    const ver = scheduleVersions.find(v => v.id === id);
    if (!ver) return;
    if (!confirm(`v${ver.version} を復元しますか？\n現在の勤務表は上書きされます。`)) return;
    const restoredData = JSON.parse(JSON.stringify(ver.data));
    setSchedule({ month: `${targetYear}-${targetMonth}`, data: restoredData });
    saveScheduleToLocalStorage(restoredData);
    try {
      await saveSchedulesToDB(targetYear, targetMonth, restoredData);
    } catch (e) {
      console.error('バージョン復元DB保存エラー:', e);
    }
    setShowVersionHistory(false);
  };

  const deleteVersion = (id: string) => {
    const ver = scheduleVersions.find(v => v.id === id);
    if (!ver) return;
    if (!confirm(`v${ver.version} を削除しますか？`)) return;
    const updated = scheduleVersions.filter(v => v.id !== id);
    const maxVer = updated.length > 0 ? Math.max(...updated.map(v => v.version)) : 0;
    const newNextVer = maxVer + 1;
    setScheduleVersions(updated);
    setNextVersionNumber(newNextVer);
    saveVersionsToLocalStorage(updated, newNextVer);
  };

  // ============================================
  // 管理者機能
  // ============================================

  const handleAdminLogin = () => {
    if (adminPassword === storedAdminPassword) {
      setIsAdminAuth(true);
      setAdminError('');
      setSystemMode('dashboard');
    } else {
      setAdminError('パスワードが正しくありません');
    }
  };

  const handlePasswordChange = async () => {
    setPasswordChangeError('');
    if (!newPasswordInput || newPasswordInput.length < 4) {
      setPasswordChangeError('パスワードは4文字以上にしてください');
      return;
    }
    if (newPasswordInput !== newPasswordConfirm) {
      setPasswordChangeError('パスワードが一致しません');
      return;
    }
    try {
      await saveSettingToDB('adminPassword', newPasswordInput);
      setStoredAdminPassword(newPasswordInput);
      setShowPasswordChange(false);
      setNewPasswordInput('');
      setNewPasswordConfirm('');
      alert('✅ パスワードを変更しました');
    } catch (e) {
      setPasswordChangeError('保存に失敗しました');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuth(false);
    setAdminPassword('');
    setSystemMode('select');
  };

  const addNurse = () => {
    if (!newNurseData.name.trim()) {
      alert('氏名を入力してください');
      return;
    }
    const newId = Math.max(...nurses.map((n: any) => n.id), 0) + 1;
    const newNurse = {
      id: newId,
      name: newNurseData.name.trim(),
      position: newNurseData.position,
      active: true
    };
    setNurses([...nurses, newNurse]);
    saveWithStatus(async () => { await upsertNurseToDB(newNurse); });
    setShowAddNurse(false);
    setNewNurseData({ name: '', position: '一般' });
  };

  const updateNurse = (id: any, updates: any) => {
    const updated = { ...nurses.find((n: any) => n.id === id), ...updates };
    setNurses(nurses.map((n: any) => n.id === id ? updated : n));
    saveWithStatus(async () => { await upsertNurseToDB(updated); });
  };

  const deleteNurse = (id: any) => {
    if (activeNurses.length <= 1) {
      alert('最低1名の職員が必要です');
      return;
    }
    setNurses(nurses.filter((n: any) => n.id !== id));
    saveWithStatus(async () => { await deleteNurseFromDB(id); });
  };

  // Excel読み込み
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        
        setExcelData(jsonData);
        updateExcelPreview(jsonData, importConfig);
        setShowExcelImport(true);
      } catch (error) {
        alert('Excelファイルの読み込みに失敗しました: ' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const columnToIndex = (col) => {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  const updateExcelPreview = (data, config) => {
    if (!data) return;
    
    const preview = [];
    const nameColIndex = columnToIndex(config.nameColumn);
    const posColIndex = columnToIndex(config.positionColumn);
    
    for (let i = config.startRow - 1; i < Math.min(config.endRow, data.length); i++) {
      const row = data[i];
      if (row && row[nameColIndex]) {
        const name = String(row[nameColIndex]).trim();
        if (name) {
          preview.push({
            row: i + 1,
            name: name,
            position: row[posColIndex] ? String(row[posColIndex]).trim() : '一般'
          });
        }
      }
    }
    
    setExcelPreview(preview);
  };

  const [excelImportConfirmed, setExcelImportConfirmed] = useState(false); // 確定済みフラグ

  const applyExcelImport = () => {
    if (excelPreview.length === 0) {
      alert('読み込むデータがありません');
      return;
    }

    // 確認ダイアログ
    if (!window.confirm(`⚠️ ${excelPreview.length}名の職員情報で現在のリストを上書きします。\nこの操作は取り消せません。\n\n本当に実行しますか？`)) {
      return;
    }

    const newNurses = excelPreview.map((item, index) => {
      let position = '一般';
      const posStr = (item.position || '').replace(/\s+/g, '');
      
      if (posStr.includes('師長')) position = '師長';
      else if (posStr.includes('主任') && !posStr.includes('副')) position = '主任';
      else if (posStr.includes('副主任') || (posStr.includes('副') && posStr.includes('主任'))) position = '副主任';
      
      return {
        id: index + 1,
        name: item.name,
        active: true,
        position: position
      };
    });

    setNurses(newNurses);
    // DB一括保存
    (async () => {
      try {
        await supabase.from(getTableName('nurses')).delete().neq('id', 0);
        if (newNurses.length > 0) {
          await supabase.from(getTableName('nurses')).insert(newNurses);
        }
      } catch (e) { console.error('DB保存エラー:', e); }
    })();
    setExcelImportConfirmed(true);
  };

  const closeExcelImport = () => {
    setShowExcelImport(false);
    setExcelData(null);
    setExcelPreview([]);
    setExcelImportConfirmed(false);
  };

  // ============================================
  // 前月勤務表読み込み機能
  // ============================================
  
  // 前月勤務表のExcel読み込み
  const handlePrevMonthUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // 前月末7日分のデータを抽出（配列形式）
        const rawData = extractPreviousMonthDataAsArray(jsonData);
        
        if (rawData.length > 0) {
          setPrevMonthRawData(rawData);
          
          // 自動マッピングを試みる
          const autoMapping = createAutoMapping(rawData);
          setPrevMonthMapping(autoMapping);
          
          setShowPrevMonthImport(false);
          setShowPrevMonthReview(true);
        } else {
          alert('前月データを抽出できませんでした。フォーマットを確認してください。');
        }
      } catch (error) {
        console.error('前月データ読み込みエラー:', error);
        alert('Excelファイルの読み込みに失敗しました');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // 自動マッピングを作成（名前の類似度で紐付け）
  const createAutoMapping = (rawData) => {
    const mapping = {};
    
    activeNurses.forEach((nurse, nurseIndex) => {
      // まず名前でマッチを試みる
      let bestMatch = -1;
      let bestScore = 0;
      
      rawData.forEach((row, rowIndex) => {
        const score = calculateNameSimilarity(nurse.name, row.name);
        if (score > bestScore && score > 0.3) { // 30%以上の類似度
          bestScore = score;
          bestMatch = rowIndex;
        }
      });
      
      // マッチが見つからない場合、行番号順で割り当て
      if (bestMatch === -1 && nurseIndex < rawData.length) {
        bestMatch = nurseIndex;
      }
      
      if (bestMatch !== -1) {
        mapping[nurse.id] = bestMatch;
      }
    });
    
    return mapping;
  };

  // 名前の類似度を計算（簡易版）
  const calculateNameSimilarity = (name1, name2) => {
    if (!name1 || !name2) return 0;
    
    const n1 = normalizeName(name1).replace(/\s/g, '');
    const n2 = normalizeName(name2).replace(/\s/g, '');
    
    if (n1 === n2) return 1;
    
    // 部分一致
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;
    
    // 文字の一致率
    const chars1 = new Set(n1);
    const chars2 = new Set(n2);
    const intersection = [...chars1].filter(c => chars2.has(c)).length;
    const union = new Set([...chars1, ...chars2]).size;
    
    return intersection / union;
  };

  // マッピングを変更
  const updateMapping = (nurseId, excelRowIndex) => {
    setPrevMonthMapping(prev => ({
      ...prev,
      [nurseId]: excelRowIndex === '' ? undefined : parseInt(excelRowIndex)
    }));
  };

  // 前月データを確定
  const confirmPreviousMonthData = () => {
    if (prevMonthRawData.length === 0) return;
    
    // マッピングに基づいてデータを作成
    const confirmedData = {};
    activeNurses.forEach(nurse => {
      const rowIndex = prevMonthMapping[nurse.id];
      if (rowIndex !== undefined && prevMonthRawData[rowIndex]) {
        confirmedData[nurse.id] = prevMonthRawData[rowIndex].shifts;
      }
    });
    
    setPreviousMonthData(confirmedData);
    
    // 制約を計算
    const constraints = calculateConstraintsFromData(confirmedData);
    setPrevMonthConstraints(constraints);

    // Supabaseに保存（月別キー）
    const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
    saveWithStatus(async () => {
      await saveSettingToDB(pmKey, JSON.stringify({ data: confirmedData, constraints }));
    });

    // ★★★ 前月データ反映後、既存の勤務表を消去（希望＋前月データから再生成させる）★★★
    setSchedule(null);
    clearScheduleFromLocalStorage();
    (async () => {
      try {
        await supabase.from(getTableName('schedules')).delete()
          .eq('year', targetYear).eq('month', targetMonth);
        console.log('前月データ反映のため勤務表を消去しました');
      } catch (e) { console.error('勤務表消去エラー:', e); }
    })();
    
    // プレビュー状態をクリア
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
    
    alert('✅ 前月データを確定しました。\n既存の勤務表は消去されました。\n希望一覧・勤務表画面に前月制約が反映されています。\n「自動生成」で新しい勤務表を作成してください。');
  };

  // プレビューをキャンセル
  const cancelPreviousMonthPreview = () => {
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
  };

  // 前月末7日分のデータを配列として抽出
  const extractPreviousMonthDataAsArray = (jsonData) => {
    const result = [];
    
    if (jsonData.length < 2) return result;
    
    // ヘッダー行と列構造を検出
    let headerRowIndex = 0;
    let nameColIndex = 1; // デフォルトは列B
    let dataStartCol = 2; // デフォルトは列C
    let dataEndCol = -1;
    
    // 最初の10行からヘッダー行を探す
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length < 3) continue;
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').trim().toLowerCase();
        
        // 氏名列を探す
        if (cell === 'name' || cell.includes('氏名') || cell.includes('名前') || 
            cell === 'スタッフ' || cell === '看護師' || cell === '職員') {
          nameColIndex = j;
          headerRowIndex = i;
        }
        
        // 日付列を探す（Excelシリアル値）
        const numVal = Number(row[j]);
        if (!isNaN(numVal) && numVal > 43000 && numVal < 50000) {
          if (dataStartCol === 2 || j < dataStartCol) dataStartCol = j;
          dataEndCol = Math.max(dataEndCol, j);
        }
      }
    }
    
    if (dataEndCol === -1) {
      dataEndCol = jsonData[0] ? jsonData[0].length - 1 : 31;
    }
    
    // データ行を処理
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row) continue;
      
      const name = String(row[nameColIndex] || '').trim();
      if (!name || name.includes('合計') || name.includes('計') || name === 'ID' || name === 'Name') continue;
      
      // 最後の7日分を取得
      const totalDays = dataEndCol - dataStartCol + 1;
      const startDay = Math.max(0, totalDays - 7);
      const shifts = [];
      
      for (let d = startDay; d < totalDays; d++) {
        const colIndex = dataStartCol + d;
        const shift = String(row[colIndex] || '').trim();
        shifts.push(normalizeShift(shift));
      }
      
      if (shifts.some(s => s)) {
        result.push({ name, shifts, rowIndex: result.length });
      }
    }
    
    return result;
  };

  // 確定済みデータから制約を計算（最大2日目まで）
  const calculateConstraintsFromData = (confirmedData) => {
    const constraints = {};
    
    activeNurses.forEach(nurse => {
      const shifts = confirmedData[nurse.id];
      if (!shifts || shifts.length === 0) return;
      
      const lastShift = shifts[shifts.length - 1];
      
      constraints[nurse.id] = {};
      
      // 前月末が「夜勤」の場合 → 1日目=明, 2日目=休
      if (lastShift === '夜') {
        constraints[nurse.id][1] = '明';  // 1日目
        constraints[nurse.id][2] = '休';  // 2日目
      }
      // 前月末が「管理夜勤」の場合 → 1日目=管明, 2日目=休
      else if (lastShift === '管夜') {
        constraints[nurse.id][1] = '管明';  // 1日目
        constraints[nurse.id][2] = '休';    // 2日目
      }
      // 前月末が「夜勤明け」or「管理夜明」の場合 → 1日目=休
      else if (lastShift === '明' || lastShift === '管明') {
        constraints[nurse.id][1] = '休';  // 1日目
      }
      // それ以外 → 制約なし
    });
    
    return constraints;
  };
  // 氏名を正規化（スペースの統一）
  const normalizeName = (name) => {
    if (!name) return '';
    // 全角スペース→半角スペース、連続スペース→単一スペース、前後のスペース削除
    return name.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // シフト記号を正規化
  const normalizeShift = (shift) => {
    if (!shift) return '';
    const s = String(shift).trim();
    if (s === '日' || s === '日勤' || s === 'D') return '日';
    if (s === '夜' || s === '夜勤' || s === 'N') return '夜';
    if (s === '明' || s === '夜明' || s === '夜勤明' || s === 'A') return '明';
    if (s === '管夜' || s === '管理夜勤') return '管夜';
    if (s === '管明' || s === '管理夜明' || s === '管理夜勤明') return '管明';
    if (s === '休' || s === '公休' || s === '公' || s === 'O' || s === '0') return '休';
    if (s === '有' || s === '有休' || s === '有給' || s === 'Y') return '有';
    if (s === 'nan' || s === 'NaN') return '休';
    // 無効な値はnull扱い
    return VALID_SHIFTS.includes(s) ? s : '';
  };

  // 前月データをクリア
  const clearPreviousMonthData = () => {
    setPreviousMonthData(null);
    setPrevMonthConstraints({});
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    // DBからも削除
    const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
    saveWithStatus(async () => {
      await saveSettingToDB(pmKey, JSON.stringify({ data: null, constraints: {} }));
    });
  };

  // 勤務表自動生成（マルチフェーズ制約最適化 + 焼きなまし法）
  const generateSchedule = async () => {
    setGenerating(true);
    setShowGenerateConfig(false);
    setGeneratingPhase('フェーズ1: 制約基盤構築...');

    // UIを更新させるためのyield
    const tick = () => new Promise<void>(r => setTimeout(r, 0));

    await tick();

    const monthKey = `${targetYear}-${targetMonth}`;
    const holidays: number[] = getJapaneseHolidays(targetYear, targetMonth);

    // ============ ヘルパー関数 ============
    const isWeekendOrHoliday = (day: number) => {
      const dow = new Date(targetYear, targetMonth, day + 1).getDay();
      return dow === 0 || dow === 6 || holidays.includes(day + 1);
    };
    const isSunday = (day: number) => new Date(targetYear, targetMonth, day + 1).getDay() === 0;
    const isYearEnd = (day: number) => targetMonth === 11 && (day + 1 === 30 || day + 1 === 31);
    const isNewYear = (day: number) => targetMonth === 0 && (day + 1 >= 1 && day + 1 <= 3);
    const isOff = (s: any) => s === '休' || s === '有';
    const isNightShift = (s: any) => s === '夜' || s === '管夜';
    const isAkeShift = (s: any) => s === '明' || s === '管明';
    const isWorkShift = (s: any) => s && !isOff(s) && !isAkeShift(s);
    const wouldBeTripleNight = (schedule: any, nurseId: number, day: number) => {
      if (day >= 4 && isNightShift(schedule[nurseId][day-4]) && isAkeShift(schedule[nurseId][day-3]) && isNightShift(schedule[nurseId][day-2]) && isAkeShift(schedule[nurseId][day-1])) return true;
      return false;
    };

    const getDayStaffReq = (day: number) => {
      if (isYearEnd(day)) return generateConfig.yearEndDayStaff;
      if (isNewYear(day)) return generateConfig.newYearDayStaff;
      if (isWeekendOrHoliday(day)) return generateConfig.weekendDayStaff;
      return generateConfig.weekdayDayStaff;
    };

    // 週ごとの夜勤人数
    const getWeeklyNightStaff = () => {
      const weeks: any[] = [];
      const firstDow = new Date(targetYear, targetMonth, 1).getDay();
      let cur = 1, wi = 0;
      const dUS = firstDow === 0 ? 0 : (7 - firstDow);
      if (dUS > 0) {
        weeks.push({ s: 1, e: Math.min(dUS, daysInMonth), c: generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1] });
        cur = dUS + 1; wi = 1;
      }
      while (cur <= daysInMonth) {
        const pi = generateConfig.startWithThree ? (wi % 2) : ((wi + 1) % 2);
        const ed = Math.min(cur + 6, daysInMonth);
        weeks.push({ s: cur, e: ed, c: generateConfig.nightShiftPattern[pi] });
        cur = ed + 1; wi++;
      }
      return weeks;
    };
    const wns = getWeeklyNightStaff();
    const getNightReq = (di: number) => {
      const d = di + 1;
      for (const p of wns) { if (d >= p.s && d <= p.e) return p.c; }
      return 3;
    };

    const cfg = {
      maxNightShifts: generateConfig.maxNightShifts,
      maxDaysOff: generateConfig.maxDaysOff,
      maxConsec: generateConfig.maxConsecutiveDays,
    };

    // 連続勤務ヘルパー
    const consecBefore = (sc: any, nid: number, day: number) => {
      let c = 0; for (let d = day - 1; d >= 0; d--) { if (isWorkShift(sc[nid][d])) c++; else break; } return c;
    };
    const consecAround = (sc: any, nid: number, day: number) => {
      let b = 0; for (let d = day - 1; d >= 0; d--) { if (isWorkShift(sc[nid][d])) b++; else break; }
      let a = 0; for (let d = day + 1; d < daysInMonth; d++) { if (isWorkShift(sc[nid][d])) a++; else break; }
      return b + 1 + a;
    };

    // 希望取得
    const exReqs: Record<number, Record<number, string>> = {};
    activeNurses.forEach(n => {
      exReqs[n.id] = {};
      const nr = requests[monthKey]?.[String(n.id)] || {};
      Object.entries(nr).forEach(([d, v]) => { exReqs[n.id][parseInt(d) - 1] = v as string; });
    });

    // 【データ保護】生成前のスナップショットを保存
    const exReqsSnapshot = JSON.stringify(exReqs);
    const prevMonthSnapshot = JSON.stringify(prevMonthConstraints);

    // 【データ保護】ロックセル機構: 希望・前月データのセルは全フェーズで上書き禁止
    const lockedCells: Record<number, Set<number>> = {};
    activeNurses.forEach(n => {
      lockedCells[n.id] = new Set();
      // 前月制約セルをロック（1-based → 0-based）
      if (prevMonthConstraints[n.id]) {
        for (const ds of Object.keys(prevMonthConstraints[n.id])) {
          const di = parseInt(ds) - 1;
          if (di >= 0 && di < daysInMonth) lockedCells[n.id].add(di);
        }
      }
      // 希望セルをロック（既に0-based）
      for (const ds of Object.keys(exReqs[n.id] || {})) {
        lockedCells[n.id].add(Number(ds));
      }
    });
    const isLocked = (nid: number, day: number) => lockedCells[nid]?.has(day) ?? false;
    console.log('🔒 ロックセル数:', Object.values(lockedCells).reduce((s, set) => s + set.size, 0));

    // 有給多い職員
    const yukyuCnt: Record<number, number> = {};
    activeNurses.forEach(n => { yukyuCnt[n.id] = Object.values(exReqs[n.id] || {}).filter(v => v === '有').length; });

    const headNurse = activeNurses.find(n => n.position === '師長');
    const mgmtNurses = activeNurses.filter(n => n.position === '主任' || n.position === '副主任');

    // ================================================================
    // フェーズ1: 制約充足基盤の構築
    // ================================================================
    const buildBase = (seed: number) => {
      const sc: Record<number, (string | null)[]> = {};
      const st: Record<number, any> = {};

      activeNurses.forEach(n => {
        sc[n.id] = Array(daysInMonth).fill(null);
        st[n.id] = { nightCount: 0, dayWorkCount: 0, daysOff: 0, totalWork: 0, weekendWork: 0 };
      });

      const cnt = (nid: number, sh: string) => {
        if (isOff(sh)) st[nid].daysOff++;
        else if (isNightShift(sh)) { st[nid].nightCount++; st[nid].totalWork++; }
        else if (!isAkeShift(sh)) { if (sh === '日') st[nid].dayWorkCount++; st[nid].totalWork++; }
      };

      // 前月制約
      activeNurses.forEach(n => {
        if (prevMonthConstraints[n.id]) {
          for (const [ds, sh] of Object.entries(prevMonthConstraints[n.id])) {
            const di = parseInt(ds) - 1;
            if (di >= 0 && di < daysInMonth) { sc[n.id][di] = sh as string; cnt(n.id, sh as string); }
          }
        }
      });

      // 希望反映（2パス方式: 直接希望を先に全配置→夜勤派生を後配置）
      // パス1: 全希望を直接配置（夜勤の明・休は後回し）
      activeNurses.forEach(n => {
        for (let d = 0; d < daysInMonth; d++) {
          if (sc[n.id][d]) continue; // 前月制約で埋まっている
          const rq = exReqs[n.id]?.[d];
          if (!rq) continue;
          sc[n.id][d] = rq; cnt(n.id, rq);
        }
      });
      // パス2: 夜勤希望の派生シフト（明・休）をロックされていないセルにのみ配置
      activeNurses.forEach(n => {
        for (let d = 0; d < daysInMonth; d++) {
          const rq = exReqs[n.id]?.[d];
          if (!rq || !isNightShift(rq)) continue;
          const ak = rq === '夜' ? '明' : '管明';
          if (d + 1 < daysInMonth && !sc[n.id][d + 1] && !isLocked(n.id, d + 1)) sc[n.id][d + 1] = ak;
          if (d + 2 < daysInMonth && !sc[n.id][d + 2] && !isLocked(n.id, d + 2)) { sc[n.id][d + 2] = '休'; st[n.id].daysOff++; }
        }
      });

      // 休日配置（8日以上保証、有給多→+2）
      activeNurses.forEach((n, idx) => {
        const bonus = yukyuCnt[n.id] >= 3 ? 2 : 0;
        const isExcluded = nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff;
        const tgt = isExcluded ? (daysInMonth - 10) : Math.min(cfg.maxDaysOff + bonus, cfg.maxDaysOff + 2);
        if (st[n.id].daysOff >= tgt) return;
        const need = tgt - st[n.id].daysOff;
        const cDay = prevMonthConstraints[n.id] ? Math.max(...Object.keys(prevMonthConstraints[n.id]).map(Number), 0) : 0;
        const placed = new Set<number>();
        let att = 0;
        while (placed.size < need && att < 300) {
          const rng = seed + idx * 7919 + att * 997;
          const dy = cDay + Math.floor((Math.abs(Math.sin(rng) * 10000)) % (daysInMonth - cDay));
          if (!sc[n.id][dy] && !isLocked(n.id, dy)) placed.add(dy);
          att++;
        }
        placed.forEach(dy => { sc[n.id][dy] = '休'; st[n.id].daysOff++; });
      });

      // 夜勤割り当て
      for (let day = 0; day < daysInMonth; day++) {
        const nReq = getNightReq(day);
        const isSp = isWeekendOrHoliday(day);
        const avail = activeNurses.filter(n => {
          if (sc[n.id][day]) return false;
          if (isLocked(n.id, day)) return false;
          const pr = nurseShiftPrefs[n.id];
          const mx = pr?.noNightShift ? 0 : (pr?.maxNightShifts ?? cfg.maxNightShifts);
          if (st[n.id].nightCount >= mx) return false;
          if (day + 1 < daysInMonth && sc[n.id][day + 1] && sc[n.id][day + 1] !== '明') return false;
          // 翌日がロックされていて明以外の希望がある場合は夜勤不可
          if (day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明') return false;
          if (day > 0 && isNightShift(sc[n.id][day - 1])) return false;
          if (wouldBeTripleNight(sc, n.id, day)) return false;
          if (consecBefore(sc, n.id, day) >= cfg.maxConsec) return false;
          return true;
        }).sort((a, b) => {
          const d = st[a.id].nightCount - st[b.id].nightCount;
          if (d !== 0) return d;
          return isSp ? st[a.id].weekendWork - st[b.id].weekendWork : st[a.id].totalWork - st[b.id].totalWork;
        });

        avail.slice(0, nReq).forEach(n => {
          sc[n.id][day] = '夜'; st[n.id].nightCount++; st[n.id].totalWork++;
          if (isSp) st[n.id].weekendWork++;
          if (day + 1 < daysInMonth && !sc[n.id][day + 1] && !isLocked(n.id, day + 1)) sc[n.id][day + 1] = '明';
          if (day + 2 < daysInMonth && !sc[n.id][day + 2] && !isLocked(n.id, day + 2)) { sc[n.id][day + 2] = '休'; st[n.id].daysOff++; }
        });

        // 日勤割り当て
        const dReq = getDayStaffReq(day);
        const sun = isSunday(day);
        const avD = activeNurses.filter(n => {
          if (sc[n.id][day]) return false;
          if (nurseShiftPrefs[n.id]?.noDayShift) return false;
          if (sun && n.position === '師長') return false;
          if (consecBefore(sc, n.id, day) >= cfg.maxConsec) return false;
          return true;
        }).sort((a, b) => isSp ? st[a.id].weekendWork - st[b.id].weekendWork || st[a.id].totalWork - st[b.id].totalWork : st[a.id].totalWork - st[b.id].totalWork);
        avD.slice(0, dReq).forEach(n => {
          sc[n.id][day] = '日'; st[n.id].dayWorkCount++; st[n.id].totalWork++;
          if (isSp) st[n.id].weekendWork++;
        });

        // 管理職チェック
        if (headNurse && isOff(sc[headNurse.id][day])) {
          if (!mgmtNurses.some(m => sc[m.id][day] === '日')) {
            const av = mgmtNurses.find(m => !sc[m.id][day] && !nurseShiftPrefs[m.id]?.noDayShift && consecBefore(sc, m.id, day) < cfg.maxConsec);
            if (av) { sc[av.id][day] = '日'; st[av.id].dayWorkCount++; st[av.id].totalWork++; if (isSp) st[av.id].weekendWork++; }
          }
        }
      }

      // 空きセル埋め
      const ddc: number[] = Array(daysInMonth).fill(0);
      for (let d = 0; d < daysInMonth; d++) activeNurses.forEach(n => { if (sc[n.id][d] === '日') ddc[d]++; });

      // 日勤不足日を優先
      for (let d = 0; d < daysInMonth; d++) {
        const req = getDayStaffReq(d);
        if (ddc[d] >= req) continue;
        activeNurses.filter(n => !sc[n.id][d] && !nurseShiftPrefs[n.id]?.noDayShift && !(isSunday(d) && n.position === '師長') && consecBefore(sc, n.id, d) < cfg.maxConsec)
          .sort((a, b) => {
            const posOrd = (n: any) => ['師長', '主任', '副主任'].includes(n.position) ? 0 : 1;
            const aPo = posOrd(a); const bPo = posOrd(b);
            if (aPo !== bPo) return aPo - bPo;
            const aLow = st[a.id].nightCount < 3 ? 0 : 1;
            const bLow = st[b.id].nightCount < 3 ? 0 : 1;
            if (aLow !== bLow) return aLow - bLow;
            return st[a.id].totalWork - st[b.id].totalWork;
          })
          .slice(0, req - ddc[d]).forEach(n => { sc[n.id][d] = '日'; st[n.id].totalWork++; st[n.id].dayWorkCount++; ddc[d]++; });
      }

      // 残りの空き（夜勤が少ない人を先に日勤配置）
      const twk = daysInMonth - cfg.maxDaysOff;
      const sortedForFill = [...activeNurses].sort((a, b) => {
        const posOrd = (n: any) => ['師長', '主任', '副主任'].includes(n.position) ? 0 : 1;
        const aPo = posOrd(a); const bPo = posOrd(b);
        if (aPo !== bPo) return aPo - bPo;
        const aLow = st[a.id].nightCount < 3 ? 0 : 1;
        const bLow = st[b.id].nightCount < 3 ? 0 : 1;
        if (aLow !== bLow) return aLow - bLow;
        return st[a.id].totalWork - st[b.id].totalWork;
      });
      sortedForFill.forEach(n => {
        for (let d = 0; d < daysInMonth; d++) {
          if (sc[n.id][d]) continue;
          if (consecBefore(sc, n.id, d) >= cfg.maxConsec) { sc[n.id][d] = '休'; st[n.id].daysOff++; }
          else if (st[n.id].totalWork < twk && !nurseShiftPrefs[n.id]?.noDayShift && !(isSunday(d) && n.position === '師長')) {
            sc[n.id][d] = '日'; st[n.id].totalWork++; st[n.id].dayWorkCount++; ddc[d]++;
          } else { sc[n.id][d] = '休'; st[n.id].daysOff++; }
        }
      });

      // 日勤補充
      for (let p = 0; p < 3; p++) {
        for (let d = 0; d < daysInMonth; d++) {
          const req = getDayStaffReq(d);
          while (ddc[d] < req) {
            const c = activeNurses.filter(n => sc[n.id][d] === '休' && !nurseShiftPrefs[n.id]?.noDayShift && !isLocked(n.id, d) && consecAround(sc, n.id, d) <= cfg.maxConsec && st[n.id].daysOff > cfg.maxDaysOff && !nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff)
              .sort((a, b) => {
                const posOrd = (n: any) => ['師長', '主任', '副主任'].includes(n.position) ? 0 : 1;
                const aPo = posOrd(a); const bPo = posOrd(b);
                if (aPo !== bPo) return aPo - bPo;
                const aLow = st[a.id].nightCount < 3 ? 0 : 1;
                const bLow = st[b.id].nightCount < 3 ? 0 : 1;
                if (aLow !== bLow) return aLow - bLow;
                return st[a.id].totalWork - st[b.id].totalWork;
              });
            if (c.length === 0) break;
            sc[c[0].id][d] = '日'; st[c[0].id].totalWork++; st[c[0].id].dayWorkCount++; st[c[0].id].daysOff--; ddc[d]++;
          }
        }
      }

      return sc;
    };

    // 複数候補から最良選択
    let bestSc: any = null;
    let bestScore = -Infinity;
    const scoreFn = (sc: any) => {
      let s = 10000;
      activeNurses.forEach(n => {
        const sh = sc[n.id];
        let off = 0, consec = 0, maxC = 0;
        for (let i = 0; i < sh.length; i++) {
          if (isOff(sh[i])) { off++; consec = 0; }
          else if (isAkeShift(sh[i])) { consec = 0; }
          else { consec++; maxC = Math.max(maxC, consec); }
        }
        const isExcl = nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff;
        if (!isExcl && off > cfg.maxDaysOff) s -= (off - cfg.maxDaysOff) * 5000;
        if (maxC > cfg.maxConsec) s -= (maxC - cfg.maxConsec) * 5000;
        for (let i = 0; i < sh.length; i++) {
          if (sh[i] === '夜' && (i + 1 >= sh.length || sh[i + 1] !== '明')) s -= 3000;
          if (sh[i] === '明' && (i === 0 || sh[i - 1] !== '夜')) s -= 3000;
          if (sh[i] === '管夜' && (i + 1 >= sh.length || sh[i + 1] !== '管明')) s -= 3000;
          if (sh[i] === '管明' && (i === 0 || sh[i - 1] !== '管夜')) s -= 3000;
        }
      });
      for (let d = 0; d < daysInMonth; d++) {
        let dc = 0, nc = 0;
        activeNurses.forEach(n => { if (sc[n.id][d] === '日') dc++; if (isNightShift(sc[n.id][d])) nc++; });
        const nr = getNightReq(d);
        if (nc !== nr) s -= Math.abs(nc - nr) * 3000;
        if (isWeekendOrHoliday(d)) { if (dc !== getDayStaffReq(d)) s -= Math.abs(dc - getDayStaffReq(d)) * 500; }
        else { const dr = getDayStaffReq(d); if (dc < dr) s -= (dr - dc) * 500; else if (dc > dr + 2) s -= (dc - dr - 2) * 300; }
      }
      return s;
    };

    for (let i = 0; i < 30; i++) {
      const sc = buildBase(i * 12345 + Date.now());
      const s = scoreFn(sc);
      if (s > bestScore) { bestScore = s; bestSc = sc; }
    }

    // ================================================================
    // フェーズ2: 焼きなまし法（Simulated Annealing）で日勤人数最適化
    // ================================================================
    setGeneratingPhase('フェーズ2: 焼きなまし最適化...');
    await tick();

    const adj = JSON.parse(JSON.stringify(bestSc));

    // 日勤人数の標準偏差を計算
    const calcDayStdDev = (sc: any) => {
      const counts: number[] = [];
      for (let d = 0; d < daysInMonth; d++) {
        if (!isWeekendOrHoliday(d)) {
          let c = 0; activeNurses.forEach(n => { if (sc[n.id][d] === '日') c++; }); counts.push(c);
        }
      }
      if (counts.length === 0) return 0;
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      return Math.sqrt(counts.reduce((s, c) => s + (c - avg) ** 2, 0) / counts.length);
    };

    // SA目的関数: 日勤ばらつき + 制約違反ペナルティ
    const saObjective = (sc: any) => {
      let penalty = 0;
      // 日勤人数制約
      for (let d = 0; d < daysInMonth; d++) {
        let dc = 0; activeNurses.forEach(n => { if (sc[n.id][d] === '日') dc++; });
        if (isWeekendOrHoliday(d)) { if (dc !== getDayStaffReq(d)) penalty += Math.abs(dc - getDayStaffReq(d)) * 100; }
        else { const dr = getDayStaffReq(d); if (dc < dr) penalty += (dr - dc) * 100; if (dc > dr + 2) penalty += (dc - dr - 2) * 100; }
      }
      // 連続勤務制約
      activeNurses.forEach(n => {
        let consec = 0;
        for (let d = 0; d < daysInMonth; d++) {
          if (isWorkShift(sc[n.id][d])) { consec++; if (consec > cfg.maxConsec) penalty += 200; } else consec = 0;
        }
        // 休日数
        const off = sc[n.id].filter((s: any) => isOff(s)).length;
        if (!nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff && off > cfg.maxDaysOff) penalty += (off - cfg.maxDaysOff) * 200;
      });
      return calcDayStdDev(sc) + penalty;
    };

    // 制約を壊さないスワップを試みる
    let temperature = 100;
    const coolingRate = 0.95;
    let currentCost = saObjective(adj);
    let bestCost = currentCost;
    const bestAdj = JSON.parse(JSON.stringify(adj));
    const maxIter = 1000;

    for (let iter = 0; iter < maxIter; iter++) {
      // ランダムに職員と日を選び、日勤⇔休をスワップ
      const nurseIdx = Math.floor(Math.random() * activeNurses.length);
      const nurse = activeNurses[nurseIdx];
      const day = Math.floor(Math.random() * daysInMonth);
      const current = adj[nurse.id][day];

      // 夜勤系・明・希望・前月制約は触らない
      if (isNightShift(current) || isAkeShift(current)) continue;
      if (isLocked(nurse.id, day)) continue;

      let newShift: string | null = null;
      if (current === '日') {
        newShift = '休';
      } else if (current === '休') {
        if (nurseShiftPrefs[nurse.id]?.noDayShift) continue;
        if (isSunday(day) && nurse.position === '師長') continue;
        newShift = '日';
      } else continue;

      // テスト適用
      const old = adj[nurse.id][day];
      adj[nurse.id][day] = newShift;

      // 連続勤務チェック
      let valid = true;
      if (newShift === '日') {
        if (consecAround(adj, nurse.id, day) > cfg.maxConsec) valid = false;
      }
      // 休日数チェック
      if (valid && newShift === '日') {
        const off = adj[nurse.id].filter((s: any) => isOff(s)).length;
        if (!nurseShiftPrefs[nurse.id]?.excludeFromMaxDaysOff && off > cfg.maxDaysOff) valid = false;
      }

      if (!valid) { adj[nurse.id][day] = old; continue; }

      const newCost = saObjective(adj);
      const delta = newCost - currentCost;

      if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
        currentCost = newCost;
        if (newCost < bestCost) {
          bestCost = newCost;
          activeNurses.forEach(n => { for (let d = 0; d < daysInMonth; d++) bestAdj[n.id][d] = adj[n.id][d]; });
        }
      } else {
        adj[nurse.id][day] = old;
      }

      temperature *= coolingRate;
    }

    // bestAdjを適用
    activeNurses.forEach(n => { for (let d = 0; d < daysInMonth; d++) adj[n.id][d] = bestAdj[n.id][d]; });

    // ================================================================
    // フェーズ3: 個人別公平性調整
    // ================================================================
    setGeneratingPhase('フェーズ3: 公平性調整...');
    await tick();

    // 日勤日数の平均を計算し、偏りを是正
    const avgDayWork = activeNurses.reduce((s, n) => s + adj[n.id].filter((sh: any) => sh === '日').length, 0) / activeNurses.length;
    for (let pass = 0; pass < 5; pass++) {
      // 日勤が多すぎる人→少なすぎる人にスワップ
      const sorted = activeNurses.map(n => ({ id: n.id, dc: adj[n.id].filter((sh: any) => sh === '日').length })).sort((a, b) => b.dc - a.dc);
      const most = sorted[0];
      const least = sorted[sorted.length - 1];
      if (most.dc - least.dc <= 2) break;

      let swapped = false;
      for (let d = 0; d < daysInMonth && !swapped; d++) {
        if (adj[most.id][d] === '日' && adj[least.id][d] === '休'
          && !isLocked(most.id, d) && !isLocked(least.id, d)
          && !nurseShiftPrefs[least.id]?.noDayShift
          && !(isSunday(d) && activeNurses.find(n => n.id === least.id)?.position === '師長')) {
          // スワップ後の連続勤務チェック
          adj[most.id][d] = '休'; adj[least.id][d] = '日';
          const mOk = (() => { let c = 0; for (let i = 0; i < daysInMonth; i++) { if (isWorkShift(adj[most.id][i])) { c++; if (c > cfg.maxConsec) return false; } else c = 0; } return true; })();
          const lOk = (() => { let c = 0; for (let i = 0; i < daysInMonth; i++) { if (isWorkShift(adj[least.id][i])) { c++; if (c > cfg.maxConsec) return false; } else c = 0; } return true; })();
          const mOff = adj[most.id].filter((s: any) => isOff(s)).length;
          const lOff = adj[least.id].filter((s: any) => isOff(s)).length;
          if (mOk && lOk && mOff <= cfg.maxDaysOff && lOff <= cfg.maxDaysOff) { swapped = true; }
          else { adj[most.id][d] = '日'; adj[least.id][d] = '休'; }
        }
      }
    }

    // ================================================================
    // フェーズ4: 最終強制修正
    // ================================================================
    setGeneratingPhase('フェーズ4: 最終検証・修正...');
    await tick();

    // A. 夜勤人数の強制調整
    for (let day = 0; day < daysInMonth; day++) {
      const nReq = getNightReq(day);
      let nc = 0;
      activeNurses.forEach(n => { if (isNightShift(adj[n.id][day])) nc++; });

      while (nc < nReq) {
        const cands = activeNurses.filter(n => {
          if (isNightShift(adj[n.id][day]) || isAkeShift(adj[n.id][day])) return false;
          if (isLocked(n.id, day)) return false;
          if (day > 0 && isNightShift(adj[n.id][day - 1])) return false;
          if (day + 1 < daysInMonth && isNightShift(adj[n.id][day + 1])) return false;
          // 翌日がロックされていて明以外→夜勤配置不可
          if (day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明') return false;
          const pr = nurseShiftPrefs[n.id];
          if (pr?.noNightShift) return false;
          const mx = pr?.maxNightShifts ?? cfg.maxNightShifts;
          if (adj[n.id].filter((s: any) => isNightShift(s)).length >= mx) return false;
          if (wouldBeTripleNight(adj, n.id, day)) return false;
          return true;
        }).sort((a, b) => adj[a.id].filter((s: any) => isNightShift(s)).length - adj[b.id].filter((s: any) => isNightShift(s)).length);
        if (cands.length === 0) break;
        const pk = cands[0];
        adj[pk.id][day] = '夜';
        if (day + 1 < daysInMonth && !isLocked(pk.id, day + 1)) adj[pk.id][day + 1] = '明';
        if (day + 2 < daysInMonth && !isNightShift(adj[pk.id][day + 2]) && !isLocked(pk.id, day + 2)) adj[pk.id][day + 2] = '休';
        nc++;
      }
      while (nc > nReq) {
        const nns = activeNurses.filter(n => adj[n.id][day] === '夜' && !isLocked(n.id, day));
        if (nns.length === 0) break;
        nns.sort((a, b) => adj[b.id].filter((s: any) => isNightShift(s)).length - adj[a.id].filter((s: any) => isNightShift(s)).length);
        adj[nns[0].id][day] = '日';
        if (day + 1 < daysInMonth && adj[nns[0].id][day + 1] === '明' && !isLocked(nns[0].id, day + 1)) adj[nns[0].id][day + 1] = '日';
        nc--;
      }
    }

    // B. 夜→明→休整合性（ロックセル保護）
    activeNurses.forEach(n => {
      for (let d = 0; d < daysInMonth; d++) {
        if (adj[n.id][d] === '夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '明';
        if (adj[n.id][d] === '管夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '管明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '管明';
        if (adj[n.id][d] === '夜' && d + 2 < daysInMonth && !isNightShift(adj[n.id][d + 2]) && !isAkeShift(adj[n.id][d + 2]) && !isLocked(n.id, d + 2)) adj[n.id][d + 2] = '休';
        if (adj[n.id][d] === '管夜' && d + 2 < daysInMonth && !isNightShift(adj[n.id][d + 2]) && !isAkeShift(adj[n.id][d + 2]) && !isLocked(n.id, d + 2)) adj[n.id][d + 2] = '休';
      }
      // 夜明夜明→休休（ロック保護）
      for (let d = 0; d < daysInMonth - 5; d++) {
        if (isNightShift(adj[n.id][d]) && isAkeShift(adj[n.id][d+1]) && isNightShift(adj[n.id][d+2]) && isAkeShift(adj[n.id][d+3])) {
          if (d + 4 < daysInMonth && adj[n.id][d+4] !== '休' && !isLocked(n.id, d + 4)) adj[n.id][d+4] = '休';
          if (d + 5 < daysInMonth && adj[n.id][d+5] !== '休' && !isLocked(n.id, d + 5)) adj[n.id][d+5] = '休';
        }
      }
      // 夜明3連禁止（ロック保護）
      for (let d = 0; d < daysInMonth - 4; d++) {
        if (isNightShift(adj[n.id][d]) && isAkeShift(adj[n.id][d+1]) && isNightShift(adj[n.id][d+2]) && isAkeShift(adj[n.id][d+3]) && d+4 < daysInMonth && isNightShift(adj[n.id][d+4])) {
          if (!isLocked(n.id, d + 4)) adj[n.id][d+4] = '休';
          if (d+5 < daysInMonth && isAkeShift(adj[n.id][d+5]) && !isLocked(n.id, d + 5)) adj[n.id][d+5] = '休';
        }
      }
      // 職員別夜勤上限（ロック保護）
      const pr = nurseShiftPrefs[n.id];
      const mx = pr?.noNightShift ? 0 : (pr?.maxNightShifts ?? cfg.maxNightShifts);
      let nc2 = adj[n.id].filter((s: any) => isNightShift(s)).length;
      if (nc2 > mx) {
        for (let d = daysInMonth - 1; d >= 0 && nc2 > mx; d--) {
          if (adj[n.id][d] === '夜' && !isLocked(n.id, d)) {
            adj[n.id][d] = '日';
            if (d + 1 < daysInMonth && adj[n.id][d + 1] === '明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '日';
            nc2--;
          }
        }
      }
    });

    // C. 孤立明除去（ロック保護）
    activeNurses.forEach(n => {
      for (let d = 0; d < daysInMonth; d++) {
        if (adj[n.id][d] === '明' && (d === 0 || adj[n.id][d - 1] !== '夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
        if (adj[n.id][d] === '管明' && (d === 0 || adj[n.id][d - 1] !== '管夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
      }
    });

    // D. 夜勤人数最終修正（ロック保護）
    for (let day = 0; day < daysInMonth; day++) {
      const nReq = getNightReq(day);
      let nc = 0;
      activeNurses.forEach(n => { if (isNightShift(adj[n.id][day])) nc++; });
      while (nc < nReq) {
        const c = activeNurses.filter(n => !isNightShift(adj[n.id][day]) && !isAkeShift(adj[n.id][day]) && !isLocked(n.id, day) && !(day > 0 && isNightShift(adj[n.id][day-1])) && !(day+1 < daysInMonth && isNightShift(adj[n.id][day+1])) && !nurseShiftPrefs[n.id]?.noNightShift && adj[n.id].filter((s: any) => isNightShift(s)).length < (nurseShiftPrefs[n.id]?.maxNightShifts ?? cfg.maxNightShifts)
          && !(day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明')
          && !wouldBeTripleNight(adj, n.id, day))
          .sort((a, b) => adj[a.id].filter((s: any) => isNightShift(s)).length - adj[b.id].filter((s: any) => isNightShift(s)).length);
        if (c.length === 0) break;
        adj[c[0].id][day] = '夜';
        if (day + 1 < daysInMonth && !isLocked(c[0].id, day + 1)) adj[c[0].id][day + 1] = '明';
        if (day + 2 < daysInMonth && !isNightShift(adj[c[0].id][day + 2]) && !isLocked(c[0].id, day + 2)) adj[c[0].id][day + 2] = '休';
        nc++;
      }
      while (nc > nReq) {
        const nn = activeNurses.filter(n => adj[n.id][day] === '夜' && !isLocked(n.id, day));
        if (nn.length === 0) break;
        nn.sort((a, b) => adj[b.id].filter((s: any) => isNightShift(s)).length - adj[a.id].filter((s: any) => isNightShift(s)).length);
        adj[nn[0].id][day] = '日';
        if (day + 1 < daysInMonth && adj[nn[0].id][day + 1] === '明' && !isLocked(nn[0].id, day + 1)) adj[nn[0].id][day + 1] = '日';
        nc--;
      }
    }

    // E. 最終夜→明 + 孤立明除去（ロック保護）
    activeNurses.forEach(n => {
      for (let d = 0; d < daysInMonth; d++) {
        if (adj[n.id][d] === '夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '明';
        if (adj[n.id][d] === '管夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '管明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '管明';
        if (adj[n.id][d] === '明' && (d === 0 || adj[n.id][d - 1] !== '夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
        if (adj[n.id][d] === '管明' && (d === 0 || adj[n.id][d - 1] !== '管夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
      }
    });

    // F. 連続勤務3日超え強制修正（ロック保護）
    activeNurses.forEach(n => {
      let c = 0;
      for (let d = 0; d < daysInMonth; d++) {
        if (isWorkShift(adj[n.id][d])) {
          c++;
          if (c > cfg.maxConsec && !isLocked(n.id, d) && !isNightShift(adj[n.id][d]) && !isAkeShift(adj[n.id][d])) {
            adj[n.id][d] = '休'; c = 0;
          }
        }
        else c = 0;
      }
    });

    // G. 最大休日数制限（ロック保護）— 除外者はスキップ
    activeNurses.forEach(n => {
      if (nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff) return; // 退職有給消化者は除外
      let off = adj[n.id].filter((s: any) => isOff(s)).length;
      if (off > cfg.maxDaysOff) {
        for (let d = daysInMonth - 1; d >= 0 && off > cfg.maxDaysOff; d--) {
          if (adj[n.id][d] === '休' && !isLocked(n.id, d)) {
            adj[n.id][d] = '日';
            off--;
          }
        }
      }
    });

    // H. 最終夜勤・日勤人数の絶対保証（全修正後の最終調整）
    for (let day = 0; day < daysInMonth; day++) {
      const nReq = getNightReq(day);
      let nc = 0;
      activeNurses.forEach(n => { if (isNightShift(adj[n.id][day])) nc++; });

      while (nc < nReq) {
        const cands = activeNurses.filter(n => {
          if (isNightShift(adj[n.id][day]) || isAkeShift(adj[n.id][day])) return false;
          if (isLocked(n.id, day)) return false;
          if (day > 0 && isNightShift(adj[n.id][day - 1])) return false;
          if (day + 1 < daysInMonth && isNightShift(adj[n.id][day + 1])) return false;
          if (day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明') return false;
          const pr = nurseShiftPrefs[n.id];
          if (pr?.noNightShift) return false;
          const mx = pr?.maxNightShifts ?? cfg.maxNightShifts;
          if (adj[n.id].filter((s: any) => isNightShift(s)).length >= mx) return false;
          if (wouldBeTripleNight(adj, n.id, day)) return false;
          return true;
        }).sort((a, b) => adj[a.id].filter((s: any) => isNightShift(s)).length - adj[b.id].filter((s: any) => isNightShift(s)).length);

        if (cands.length === 0) break;
        const pk = cands[0];
        adj[pk.id][day] = '夜';
        if (day + 1 < daysInMonth && !isLocked(pk.id, day + 1)) adj[pk.id][day + 1] = '明';
        if (day + 2 < daysInMonth && !isNightShift(adj[pk.id][day + 2]) && !isLocked(pk.id, day + 2)) adj[pk.id][day + 2] = '休';
        nc++;
      }

      while (nc > nReq) {
        const nns = activeNurses.filter(n => adj[n.id][day] === '夜' && !isLocked(n.id, day));
        if (nns.length === 0) break;
        nns.sort((a, b) => adj[b.id].filter((s: any) => isNightShift(s)).length - adj[a.id].filter((s: any) => isNightShift(s)).length);
        adj[nns[0].id][day] = '日';
        if (day + 1 < daysInMonth && adj[nns[0].id][day + 1] === '明' && !isLocked(nns[0].id, day + 1)) adj[nns[0].id][day + 1] = '日';
        nc--;
      }
    }

    // 最終夜→明整合性
    activeNurses.forEach(n => {
      for (let d = 0; d < daysInMonth; d++) {
        if (adj[n.id][d] === '夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '明';
        if (adj[n.id][d] === '管夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '管明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '管明';
        if (adj[n.id][d] === '明' && (d === 0 || adj[n.id][d - 1] !== '夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
        if (adj[n.id][d] === '管明' && (d === 0 || adj[n.id][d - 1] !== '管夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
      }
    });

    // I. 日勤人数の最終保証（3段階）

    // I-1. 日別の直接調整（複数パス）
    for (let pass = 0; pass < 5; pass++) {
      let improved = false;
      for (let day = 0; day < daysInMonth; day++) {
        const dayReq = getDayStaffReq(day);
        let dc = 0;
        activeNurses.forEach(n => { if (adj[n.id][day] === '日') dc++; });

        // 日勤不足 → 休みの人を日勤に変更
        while (dc < dayReq) {
          const cands = activeNurses.filter(n => {
            if (adj[n.id][day] !== '休') return false;
            if (isLocked(n.id, day)) return false;
            if (nurseShiftPrefs[n.id]?.noDayShift) return false;
            if (isSunday(day) && n.position === '師長') return false;
            if (nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff) return false;
            let before = 0;
            for (let d = day - 1; d >= 0; d--) { if (isWorkShift(adj[n.id][d])) before++; else break; }
            let after = 0;
            for (let d = day + 1; d < daysInMonth; d++) { if (isWorkShift(adj[n.id][d])) after++; else break; }
            if (before + 1 + after > cfg.maxConsec) return false;
            return true;
          }).sort((a, b) => {
            // 役職者（師長・主任・副主任）を最優先
            const posOrder = (n: any) => ['師長', '主任', '副主任'].includes(n.position) ? 0 : 1;
            const aPo = posOrder(a); const bPo = posOrder(b);
            if (aPo !== bPo) return aPo - bPo;
            const aNight = adj[a.id].filter((s: any) => isNightShift(s)).length;
            const bNight = adj[b.id].filter((s: any) => isNightShift(s)).length;
            const aLow = aNight < 3 ? 0 : 1;
            const bLow = bNight < 3 ? 0 : 1;
            if (aLow !== bLow) return aLow - bLow;
            const aOff = adj[a.id].filter((s: any) => isOff(s)).length;
            const bOff = adj[b.id].filter((s: any) => isOff(s)).length;
            return bOff - aOff;
          });
          if (cands.length === 0) break;
          adj[cands[0].id][day] = '日';
          dc++;
          improved = true;
        }

        // 日勤過多 → 日勤の人を休みに変更（平日は8まで許容、土日祝は設定値厳守）
        const maxAllowed = isWeekendOrHoliday(day) ? dayReq : dayReq + 2;
        while (dc > maxAllowed) {
          const cands = activeNurses.filter(n => {
            if (adj[n.id][day] !== '日') return false;
            if (isLocked(n.id, day)) return false;
            return true;
          }).sort((a, b) => {
            const aOff = adj[a.id].filter((s: any) => isOff(s)).length;
            const bOff = adj[b.id].filter((s: any) => isOff(s)).length;
            return aOff - bOff;
          });
          if (cands.length === 0) break;
          adj[cands[0].id][day] = '休';
          dc--;
          improved = true;
        }
      }
      if (!improved) break;
    }

    // I-2. 日別スワップ（過多日→不足日で同一看護師の日勤と休みを交換）
    for (let pass = 0; pass < 10; pass++) {
      let swapped = false;
      const dayCounts: number[] = [];
      for (let d = 0; d < daysInMonth; d++) {
        let c = 0; activeNurses.forEach(n => { if (adj[n.id][d] === '日') c++; }); dayCounts.push(c);
      }

      for (let shortDay = 0; shortDay < daysInMonth && !swapped; shortDay++) {
        const reqS = getDayStaffReq(shortDay);
        if (dayCounts[shortDay] >= reqS) continue;

        for (let overDay = 0; overDay < daysInMonth && !swapped; overDay++) {
          const reqO = getDayStaffReq(overDay);
          const maxO = isWeekendOrHoliday(overDay) ? reqO : reqO + 2;
          if (dayCounts[overDay] <= maxO) continue;
          if (shortDay === overDay) continue;

          const cands = activeNurses.filter(n => {
            if (adj[n.id][overDay] !== '日' || adj[n.id][shortDay] !== '休') return false;
            if (isLocked(n.id, overDay) || isLocked(n.id, shortDay)) return false;
            if (nurseShiftPrefs[n.id]?.noDayShift) return false;
            if (isSunday(shortDay) && n.position === '師長') return false;
            let before = 0;
            for (let d = shortDay - 1; d >= 0; d--) { if (isWorkShift(adj[n.id][d])) before++; else break; }
            let after = 0;
            for (let d = shortDay + 1; d < daysInMonth; d++) { if (isWorkShift(adj[n.id][d])) after++; else break; }
            if (before + 1 + after > cfg.maxConsec) return false;
            return true;
          });
          if (cands.length === 0) continue;

          adj[cands[0].id][overDay] = '休';
          adj[cands[0].id][shortDay] = '日';
          dayCounts[overDay]--;
          dayCounts[shortDay]++;
          swapped = true;
        }
      }
      if (!swapped) break;
    }

    // I-3. 最終微調整（まだ不足している日に対して日勤日数が少ない人を優先配置）
    for (let day = 0; day < daysInMonth; day++) {
      const dayReq = getDayStaffReq(day);
      let dc = 0;
      activeNurses.forEach(n => { if (adj[n.id][day] === '日') dc++; });
      while (dc < dayReq) {
        const cands = activeNurses.filter(n => {
          if (adj[n.id][day] !== '休') return false;
          if (isLocked(n.id, day)) return false;
          if (nurseShiftPrefs[n.id]?.noDayShift) return false;
          if (isSunday(day) && n.position === '師長') return false;
          if (nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff) return false;
          let before = 0;
          for (let d = day - 1; d >= 0; d--) { if (isWorkShift(adj[n.id][d])) before++; else break; }
          let after = 0;
          for (let d = day + 1; d < daysInMonth; d++) { if (isWorkShift(adj[n.id][d])) after++; else break; }
          if (before + 1 + after > cfg.maxConsec) return false;
          return true;
        }).sort((a, b) => {
          // 役職者を最優先
          const posOrder = (n: any) => ['師長', '主任', '副主任'].includes(n.position) ? 0 : 1;
          const aPo = posOrder(a); const bPo = posOrder(b);
          if (aPo !== bPo) return aPo - bPo;
          const aDc = adj[a.id].filter((s: any) => s === '日').length;
          const bDc = adj[b.id].filter((s: any) => s === '日').length;
          if (aDc !== bDc) return aDc - bDc;
          const aOff = adj[a.id].filter((s: any) => isOff(s)).length;
          const bOff = adj[b.id].filter((s: any) => isOff(s)).length;
          return bOff - aOff;
        });
        if (cands.length === 0) break;
        adj[cands[0].id][day] = '日';
        dc++;
      }
    }

    // J. 夜勤人数の絶対最終保証（全フェーズ終了後の最終チェック）
    for (let day = 0; day < daysInMonth; day++) {
      const nReq = getNightReq(day);
      let nc = 0;
      activeNurses.forEach(n => { if (isNightShift(adj[n.id][day])) nc++; });

      // 夜勤不足
      while (nc < nReq) {
        // 第1候補: 通常条件
        let cands = activeNurses.filter(n => {
          if (isNightShift(adj[n.id][day]) || isAkeShift(adj[n.id][day])) return false;
          if (isLocked(n.id, day)) return false;
          if (day > 0 && isNightShift(adj[n.id][day - 1])) return false;
          if (day + 1 < daysInMonth && isNightShift(adj[n.id][day + 1])) return false;
          if (day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明') return false;
          const pr = nurseShiftPrefs[n.id];
          if (pr?.noNightShift) return false;
          const mx = pr?.maxNightShifts ?? cfg.maxNightShifts;
          if (adj[n.id].filter((s: any) => isNightShift(s)).length >= mx) return false;
          if (wouldBeTripleNight(adj, n.id, day)) return false;
          return true;
        }).sort((a, b) => adj[a.id].filter((s: any) => isNightShift(s)).length - adj[b.id].filter((s: any) => isNightShift(s)).length);

        // 第1候補が見つからない場合、緩和条件で再検索（夜勤上限を+1まで許容）
        if (cands.length === 0) {
          cands = activeNurses.filter(n => {
            if (isNightShift(adj[n.id][day]) || isAkeShift(adj[n.id][day])) return false;
            if (isLocked(n.id, day)) return false;
            if (day > 0 && isNightShift(adj[n.id][day - 1])) return false;
            if (day + 1 < daysInMonth && isNightShift(adj[n.id][day + 1])) return false;
            if (day + 1 < daysInMonth && isLocked(n.id, day + 1) && exReqs[n.id]?.[day + 1] && exReqs[n.id][day + 1] !== '明') return false;
            const pr = nurseShiftPrefs[n.id];
            if (pr?.noNightShift) return false;
            const mx = (pr?.maxNightShifts ?? cfg.maxNightShifts) + 1;
            if (adj[n.id].filter((s: any) => isNightShift(s)).length >= mx) return false;
            if (wouldBeTripleNight(adj, n.id, day)) return false;
            return true;
          }).sort((a, b) => adj[a.id].filter((s: any) => isNightShift(s)).length - adj[b.id].filter((s: any) => isNightShift(s)).length);
        }

        if (cands.length === 0) break;
        const pk = cands[0];
        adj[pk.id][day] = '夜';
        if (day + 1 < daysInMonth && !isLocked(pk.id, day + 1)) adj[pk.id][day + 1] = '明';
        if (day + 2 < daysInMonth && !isNightShift(adj[pk.id][day + 2]) && !isLocked(pk.id, day + 2)) adj[pk.id][day + 2] = '休';
        nc++;
      }

      // 夜勤過多
      while (nc > nReq) {
        const nns = activeNurses.filter(n => adj[n.id][day] === '夜' && !isLocked(n.id, day));
        if (nns.length === 0) break;
        nns.sort((a, b) => adj[b.id].filter((s: any) => isNightShift(s)).length - adj[a.id].filter((s: any) => isNightShift(s)).length);
        adj[nns[0].id][day] = '日';
        if (day + 1 < daysInMonth && adj[nns[0].id][day + 1] === '明' && !isLocked(nns[0].id, day + 1)) adj[nns[0].id][day + 1] = '日';
        nc--;
      }
    }

    // 最終夜→明・孤立明整合性
    activeNurses.forEach(n => {
      for (let d = 0; d < daysInMonth; d++) {
        if (adj[n.id][d] === '夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '明';
        if (adj[n.id][d] === '管夜' && d + 1 < daysInMonth && adj[n.id][d + 1] !== '管明' && !isLocked(n.id, d + 1)) adj[n.id][d + 1] = '管明';
        if (adj[n.id][d] === '明' && (d === 0 || adj[n.id][d - 1] !== '夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
        if (adj[n.id][d] === '管明' && (d === 0 || adj[n.id][d - 1] !== '管夜') && !isLocked(n.id, d)) adj[n.id][d] = '休';
      }
    });

    // ============ 最終スケジュール & 検証レポート ============
    const final: Record<string, any> = {};
    activeNurses.forEach(n => { final[n.id] = adj[n.id]; });

    // 日別日勤人数
    const dailyDayCounts: number[] = [];
    for (let d = 0; d < daysInMonth; d++) {
      let c = 0; activeNurses.forEach(n => { if (final[n.id][d] === '日') c++; }); dailyDayCounts.push(c);
    }
    const weekdayCounts = dailyDayCounts.filter((_, d) => !isWeekendOrHoliday(d));
    const stdDev = calcDayStdDev(final);

    const report: string[] = [];
    let hasViolation = false;

    report.push(`📊 日別日勤人数: [${dailyDayCounts.join(', ')}]`);
    report.push(`📊 平日日勤ばらつき（標準偏差）: ${stdDev.toFixed(2)}`);
    report.push('');

    // 夜勤人数
    let nightOk = true;
    for (let d = 0; d < daysInMonth; d++) {
      let nc = 0; activeNurses.forEach(n => { if (isNightShift(final[n.id][d])) nc++; });
      const nr = getNightReq(d);
      if (nc !== nr) { nightOk = false; hasViolation = true; report.push(`⚠️ ${d+1}日: 夜勤${nc}人（要件${nr}人）`); }
    }
    if (nightOk) report.push('✅ 夜勤人数: 全日OK');

    // 日勤人数
    let dayOk = true;
    for (let d = 0; d < daysInMonth; d++) {
      const dc = dailyDayCounts[d];
      if (isWeekendOrHoliday(d)) {
        if (dc !== getDayStaffReq(d)) { dayOk = false; report.push(`⚠️ ${d+1}日(休日): 日勤${dc}人（要件${getDayStaffReq(d)}人）`); }
      } else {
        const drReq = getDayStaffReq(d); if (dc < drReq || dc > drReq + 2) { dayOk = false; report.push(`⚠️ ${d+1}日(平日): 日勤${dc}人（許容${drReq}-${drReq + 2}人）`); }
      }
    }
    if (dayOk) report.push('✅ 日勤人数: 全日OK');

    // 職員別
    let staffOk = true;
    const staffDayCounts: { name: string; dc: number; off: number; kyuCount: number; yuCount: number }[] = [];
    activeNurses.forEach(n => {
      const sh = final[n.id];
      // 厳密カウント: 1セルずつ確認
      let kyuCount = 0, yuCount = 0, akeCount = 0, nightCount = 0, dayCount = 0, otherCount = 0;
      const shiftList: string[] = [];
      for (let d = 0; d < sh.length; d++) {
        const s = sh[d];
        shiftList.push(s || '空');
        if (s === '休') kyuCount++;
        else if (s === '有') yuCount++;
        else if (s === '明' || s === '管明') akeCount++;
        else if (s === '夜' || s === '管夜') nightCount++;
        else if (s === '日') dayCount++;
        else otherCount++;
      }
      const off = kyuCount + yuCount; // 休+有のみ（明は絶対に除外）
      const dc = dayCount;
      staffDayCounts.push({ name: n.name, dc, off, kyuCount, yuCount });
      console.log(`【${n.name}】休み${off}日（休${kyuCount} + 有${yuCount}）| 日${dayCount} 夜${nightCount} 明${akeCount} 他${otherCount} | 合計${sh.length}日`);
      console.log(`  シフト: ${shiftList.join(',')}`);
      if (!nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff && off > cfg.maxDaysOff) {
        staffOk = false; hasViolation = true;
        report.push(`⚠️ ${n.name}: 休み${off}日（休${kyuCount} + 有${yuCount}、上限${cfg.maxDaysOff}日超過）※明${akeCount}日は除外`);
      }
      if (nurseShiftPrefs[n.id]?.excludeFromMaxDaysOff) {
        report.push(`ℹ️ ${n.name}: 休み${off}日（休日上限除外）`);
      }
      let consec = 0, maxC = 0;
      for (let i = 0; i < sh.length; i++) { if (isWorkShift(sh[i])) { consec++; maxC = Math.max(maxC, consec); } else consec = 0; }
      if (maxC > cfg.maxConsec) { staffOk = false; hasViolation = true; report.push(`⚠️ ${n.name}: 最大連続勤務${maxC}日（上限${cfg.maxConsec}日）`); }
      for (let i = 0; i < sh.length; i++) {
        if (sh[i] === '明' && (i === 0 || sh[i-1] !== '夜')) { staffOk = false; report.push(`⚠️ ${n.name}: ${i+1}日に孤立「明」`); }
        if (sh[i] === '管明' && (i === 0 || sh[i-1] !== '管夜')) { staffOk = false; report.push(`⚠️ ${n.name}: ${i+1}日に孤立「管明」`); }
      }
    });
    if (staffOk) report.push('✅ 職員別制約: 全員OK');

    // 【データ保護検証】希望データと前月データが変更されていないか確認
    let dataProtectionOk = true;
    const exReqsAfter = JSON.stringify(exReqs);
    const prevMonthAfter = JSON.stringify(prevMonthConstraints);
    if (exReqsSnapshot !== exReqsAfter) {
      dataProtectionOk = false; hasViolation = true;
      report.push('⚠️ 希望データが生成中に変更されました！');
      console.warn('【データ保護違反】希望データが変更されました');
      console.warn('  生成前:', exReqsSnapshot.substring(0, 200));
      console.warn('  生成後:', exReqsAfter.substring(0, 200));
    }
    if (prevMonthSnapshot !== prevMonthAfter) {
      dataProtectionOk = false; hasViolation = true;
      report.push('⚠️ 前月データが生成中に変更されました！');
      console.warn('【データ保護違反】前月データが変更されました');
      console.warn('  生成前:', prevMonthSnapshot.substring(0, 200));
      console.warn('  生成後:', prevMonthAfter.substring(0, 200));
    }
    if (dataProtectionOk) {
      report.push('✅ データ保護: 希望データ・前月データ保持OK');
      console.log('✅ データ保護検証: 希望データ・前月データは変更なし');
    }

    // 希望反映検証
    let reqOk = true;
    let reqTotal = 0, reqMet = 0;
    activeNurses.forEach(n => {
      for (const [dStr, req] of Object.entries(exReqs[n.id] || {})) {
        const d = Number(dStr);
        if (d < 0 || d >= daysInMonth) continue;
        reqTotal++;
        if (final[n.id][d] === req) { reqMet++; continue; }
        // 前月制約で上書きされた日は許容
        if (prevMonthConstraints[n.id]?.[d + 1]) continue;
        // 夜→明の自動配置日は希望と異なっても許容
        if (isAkeShift(final[n.id][d]) && d > 0 && isNightShift(final[n.id][d - 1])) continue;
        // 夜→明→休の休配置日は許容
        if (final[n.id][d] === '休' && d >= 2 && isNightShift(final[n.id][d - 2])) continue;
        reqOk = false;
        report.push(`⚠️ ${n.name}: ${d+1}日 希望「${req}」→実際「${final[n.id][d]}」`);
        console.warn(`  希望不一致: ${n.name} ${d+1}日 希望=${req} 実際=${final[n.id][d]}`);
      }
    });
    report.push(`📊 希望反映率: ${reqMet}/${reqTotal}件`);
    if (reqOk) report.push('✅ 希望反映: 全希望OK');

    // 職員別休み日数分布（明除外）
    const offValues = staffDayCounts.map(s => s.off);
    report.push(`📊 職員別休み日数（休+有、明除外）: ${staffDayCounts.map(s => `${s.name}:${s.off}(休${s.kyuCount}+有${s.yuCount})`).join(', ')}`);
    report.push(`📊 休み日数 最大${Math.max(...offValues)}日 / 最小${Math.min(...offValues)}日 / 差${Math.max(...offValues) - Math.min(...offValues)}日`);

    // 職員別日勤日数分布
    staffDayCounts.sort((a, b) => b.dc - a.dc);
    report.push(`📊 職員別日勤日数: ${staffDayCounts.map(s => `${s.name}:${s.dc}`).join(', ')}`);
    const dcValues = staffDayCounts.map(s => s.dc);
    report.push(`📊 日勤日数 最大${Math.max(...dcValues)}日 / 最小${Math.min(...dcValues)}日 / 差${Math.max(...dcValues) - Math.min(...dcValues)}日`);

    console.log('【検証レポート】');
    report.forEach(r => console.log(r));

    const alertLines = report.filter(r => r.startsWith('⚠️'));
    const statLines = report.filter(r => r.startsWith('📊') || r.startsWith('✅'));
    if (hasViolation) {
      alert('⚠️ 一部制約違反があります:\n\n' + alertLines.join('\n') + '\n\n' + statLines.join('\n') + '\n\n手動で調整してください。');
    } else {
      alert('✅ 全制約クリア！\n\n' + statLines.join('\n'));
    }

    setSchedule({ month: monthKey, data: final });
    saveWithStatus(async () => {
      await saveSchedulesToDB(targetYear, targetMonth, final);
      saveScheduleToLocalStorage(final);
    });
    setGenerating(false);
    setGeneratingPhase('');
  };

  // Excel用セルスタイル（シフト種別ごとの背景色・文字色）
  const getShiftExcelStyle = (shift: string | null) => {
    const border = {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } }
    };
    const center = { horizontal: 'center', vertical: 'center' };
    const base = { border, alignment: center };

    switch (shift) {
      case '日': return { ...base, fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '1D4ED8' } } };
      case '夜': return { ...base, fill: { fgColor: { rgb: 'EDE9FE' } }, font: { color: { rgb: '7C3AED' }, bold: true } };
      case '明': return { ...base, fill: { fgColor: { rgb: 'FCE7F3' } }, font: { color: { rgb: 'DB2777' } } };
      case '管夜': return { ...base, fill: { fgColor: { rgb: 'CCFBF1' } }, font: { color: { rgb: '0F766E' }, bold: true } };
      case '管明': return { ...base, fill: { fgColor: { rgb: 'CFFAFE' } }, font: { color: { rgb: '0891B2' } } };
      case '休': return { ...base, fill: { fgColor: { rgb: 'E5E7EB' } }, font: { color: { rgb: '6B7280' } } };
      case '有': return { ...base, fill: { fgColor: { rgb: 'D1FAE5' } }, font: { color: { rgb: '059669' } } };
      case '午前半': return { ...base, fill: { fgColor: { rgb: 'ECFCCB' } }, font: { color: { rgb: '65A30D' } } };
      case '午後半': return { ...base, fill: { fgColor: { rgb: 'FFEDD5' } }, font: { color: { rgb: 'EA580C' } } };
      default: return { ...base, font: {} };
    }
  };

  // 曜日ヘッダーのスタイル
  const getDowExcelStyle = (dow: string, isNationalHoliday: boolean) => {
    const border = {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } }
    };
    const center = { horizontal: 'center', vertical: 'center' };
    if (dow === '日' || isNationalHoliday) return { border, alignment: center, fill: { fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: 'EF4444' }, bold: true } };
    if (dow === '土') return { border, alignment: center, fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '3B82F6' }, bold: true } };
    return { border, alignment: center, fill: { fgColor: { rgb: 'F3F4F6' } }, font: { bold: true } };
  };

  // Excel出力（カラー対応）
  const exportToExcel = () => {
    if (!schedule) { alert('勤務表が生成されていません'); return; }

    const holidayList = getJapaneseHolidays(targetYear, targetMonth);
    const wb = XLSX.utils.book_new();

    // ヘッダー行1: タイトル
    const row0 = [`${departmentName} ${targetYear}年${targetMonth + 1}月 勤務表`];

    // ヘッダー行2: 曜日
    const dowRow: string[] = ['', ''];
    for (let i = 0; i < daysInMonth; i++) {
      dowRow.push(getDayOfWeek(targetYear, targetMonth, i + 1));
    }
    dowRow.push('夜', '日', '休', '勤');

    // ヘッダー行3: 日付
    const dayRow: string[] = ['氏名', '役職'];
    for (let i = 0; i < daysInMonth; i++) dayRow.push(String(i + 1));
    dayRow.push('', '', '', '');

    const data: string[][] = [row0, dowRow, dayRow];

    // 職員データ
    activeNurses.forEach(nurse => {
      const shifts = schedule.data[nurse.id] || [];
      const nightCount = shifts.filter((s: any) => s === '夜' || s === '管夜').length;
      const dayCount = shifts.filter((s: any) => s === '日').length;
      const offCount = shifts.filter((s: any) => s === '休' || s === '有').length
        + shifts.filter((s: any) => s === '午前半' || s === '午後半').length * 0.5;
      const workCount = shifts.filter((s: any) => s && s !== '休' && s !== '有' && s !== '明' && s !== '管明').length;
      data.push([nurse.name, nurse.position, ...shifts.map((s: any) => s || ''), String(nightCount), String(dayCount), String(offCount), String(workCount)]);
    });

    // サマリー行（夜勤人数、日勤人数）
    const nightRow: string[] = ['夜勤人数', ''];
    const dayStaffRow: string[] = ['日勤人数', ''];
    for (let i = 0; i < daysInMonth; i++) {
      let nc = 0, dc = 0;
      activeNurses.forEach(n => {
        const s = (schedule.data[n.id] || [])[i];
        if (s === '夜' || s === '管夜') nc++;
        if (s === '日') dc++;
      });
      nightRow.push(String(nc));
      dayStaffRow.push(String(dc));
    }
    nightRow.push('', '', '', '');
    dayStaffRow.push('', '', '', '');
    data.push(nightRow, dayStaffRow);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // 列幅設定
    const cols: { wch: number }[] = [{ wch: 14 }, { wch: 6 }];
    for (let i = 0; i < daysInMonth; i++) cols.push({ wch: 4 });
    cols.push({ wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 });
    ws['!cols'] = cols;

    // セルスタイル適用
    const border = { top: { style: 'thin', color: { rgb: 'CCCCCC' } }, bottom: { style: 'thin', color: { rgb: 'CCCCCC' } }, left: { style: 'thin', color: { rgb: 'CCCCCC' } }, right: { style: 'thin', color: { rgb: 'CCCCCC' } } };

    // 曜日行のスタイル
    for (let i = 0; i < daysInMonth; i++) {
      const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
      const isNatHol = holidayList.includes(i + 1);
      const cellRef = XLSX.utils.encode_cell({ r: 1, c: i + 2 });
      if (ws[cellRef]) ws[cellRef].s = getDowExcelStyle(dow, isNatHol);
      const dayCellRef = XLSX.utils.encode_cell({ r: 2, c: i + 2 });
      if (ws[dayCellRef]) ws[dayCellRef].s = getDowExcelStyle(dow, isNatHol);
    }

    // シフトセルのスタイル
    activeNurses.forEach((nurse, nIdx) => {
      const shifts = schedule.data[nurse.id] || [];
      for (let i = 0; i < daysInMonth; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: nIdx + 3, c: i + 2 });
        if (ws[cellRef]) ws[cellRef].s = getShiftExcelStyle(shifts[i]);
      }
      // 名前セル
      const nameRef = XLSX.utils.encode_cell({ r: nIdx + 3, c: 0 });
      if (ws[nameRef]) ws[nameRef].s = { border, font: { bold: true } };
    });

    // タイトル行スタイル
    const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleRef]) ws[titleRef].s = { font: { bold: true, sz: 14 } };
    // タイトル行マージ
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: daysInMonth + 1 } }];

    XLSX.utils.book_append_sheet(wb, ws, '勤務表');
    XLSX.writeFile(wb, `${departmentName}_勤務表_${targetYear}年${targetMonth + 1}月_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 希望一覧Excel出力（カラー対応）
  const exportRequestsToExcel = () => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const monthReqs = requests[monthKey] || {};
    const holidayList = getJapaneseHolidays(targetYear, targetMonth);

    const wb = XLSX.utils.book_new();

    // ヘッダー
    const row0 = [`${departmentName} ${targetYear}年${targetMonth + 1}月 希望一覧`];
    const dowRow: string[] = ['', ''];
    for (let i = 0; i < daysInMonth; i++) dowRow.push(getDayOfWeek(targetYear, targetMonth, i + 1));
    dowRow.push('合計');
    const dayRow: string[] = ['氏名', '役職'];
    for (let i = 0; i < daysInMonth; i++) dayRow.push(String(i + 1));
    dayRow.push('');

    const data: string[][] = [row0, dowRow, dayRow];

    // 職員データ
    activeNurses.forEach(nurse => {
      const nurseReqs = monthReqs[String(nurse.id)] || {};
      const constraints = prevMonthConstraints[nurse.id] || {};
      const row: string[] = [nurse.name, nurse.position];
      let count = 0;
      for (let i = 0; i < daysInMonth; i++) {
        const day = i + 1;
        const req = nurseReqs[day];
        const con = constraints[day];
        if (req) { row.push(req); count++; }
        else if (con) { row.push(`前:${con}`); }
        else { row.push(''); }
      }
      row.push(String(count));
      data.push(row);
    });

    // 希望人数サマリー行
    const summaryRow: string[] = ['希望人数', ''];
    for (let i = 0; i < daysInMonth; i++) {
      const day = i + 1;
      let count = 0;
      Object.values(monthReqs).forEach((reqs: any) => { if (reqs[day]) count++; });
      summaryRow.push(count > 0 ? String(count) : '');
    }
    summaryRow.push('');
    data.push(summaryRow);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // 列幅
    const cols: { wch: number }[] = [{ wch: 14 }, { wch: 6 }];
    for (let i = 0; i < daysInMonth; i++) cols.push({ wch: 5 });
    cols.push({ wch: 5 });
    ws['!cols'] = cols;

    const border = { top: { style: 'thin', color: { rgb: 'CCCCCC' } }, bottom: { style: 'thin', color: { rgb: 'CCCCCC' } }, left: { style: 'thin', color: { rgb: 'CCCCCC' } }, right: { style: 'thin', color: { rgb: 'CCCCCC' } } };

    // 曜日・日付行スタイル
    for (let i = 0; i < daysInMonth; i++) {
      const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
      const isNatHol = holidayList.includes(i + 1);
      const cellRef = XLSX.utils.encode_cell({ r: 1, c: i + 2 });
      if (ws[cellRef]) ws[cellRef].s = getDowExcelStyle(dow, isNatHol);
      const dayCellRef = XLSX.utils.encode_cell({ r: 2, c: i + 2 });
      if (ws[dayCellRef]) ws[dayCellRef].s = getDowExcelStyle(dow, isNatHol);
    }

    // 希望セルのスタイル
    activeNurses.forEach((nurse, nIdx) => {
      const nurseReqs = monthReqs[String(nurse.id)] || {};
      const constraints = prevMonthConstraints[nurse.id] || {};
      for (let i = 0; i < daysInMonth; i++) {
        const day = i + 1;
        const cellRef = XLSX.utils.encode_cell({ r: nIdx + 3, c: i + 2 });
        if (!ws[cellRef]) continue;
        const req = nurseReqs[day];
        const con = constraints[day];
        if (req) {
          ws[cellRef].s = getShiftExcelStyle(req);
        } else if (con) {
          ws[cellRef].s = { border, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: 'FFF7ED' } }, font: { color: { rgb: 'EA580C' }, sz: 9 } };
        } else {
          ws[cellRef].s = { border, alignment: { horizontal: 'center', vertical: 'center' } };
        }
      }
      // 名前セル
      const nameRef = XLSX.utils.encode_cell({ r: nIdx + 3, c: 0 });
      if (ws[nameRef]) ws[nameRef].s = { border, font: { bold: true } };
    });

    // 希望人数行のスタイル（3人以上で赤背景）
    const sumRowIdx = activeNurses.length + 3;
    for (let i = 0; i < daysInMonth; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: sumRowIdx, c: i + 2 });
      if (!ws[cellRef]) continue;
      const val = parseInt(ws[cellRef].v) || 0;
      ws[cellRef].s = {
        border, alignment: { horizontal: 'center', vertical: 'center' },
        fill: val >= 3 ? { fgColor: { rgb: 'FEE2E2' } } : { fgColor: { rgb: 'FFFBEB' } },
        font: val >= 3 ? { color: { rgb: 'DC2626' }, bold: true } : { bold: true }
      };
    }

    // タイトル
    const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleRef]) ws[titleRef].s = { font: { bold: true, sz: 14 } };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: daysInMonth + 1 } }];

    XLSX.utils.book_append_sheet(wb, ws, '希望一覧');
    XLSX.writeFile(wb, `${departmentName}_希望一覧_${targetYear}年${targetMonth + 1}月_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // アクセスコード一覧をコピー
  const copyAllCodes = () => {
    const codes = nursesWithCodes.map(n => 
      `${n.name}（${n.position}）: ${n.accessCode}`
    ).join('\n');
    navigator.clipboard.writeText(codes).then(() => {
      alert('全員分のアクセスコードをコピーしました');
    });
  };

  // ============================================
  // 職員機能
  // ============================================

  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | 'testing' | null>(null);
  const [dbError, setDbError] = useState('');

  const handleStaffLogin = async () => {
    const nurse = nursesWithCodes.find(n => n.accessCode === staffCode);
    if (nurse) {
      setStaffNurseId(nurse.id);
      setStaffError('');
      // ★ 最新データをDBから再取得（他のデバイスで入力されたデータを反映）
      setDbStatus('testing');
      try {
        await reloadRequestsFromDB();
        setDbStatus('ok');
      } catch (e: any) {
        setDbStatus('error');
        setDbError(e?.message || 'DB接続エラー');
        console.error('DB接続テスト失敗:', e);
      }
    } else {
      setStaffError('アクセスコードが正しくありません');
    }
  };

  const handleStaffLogout = () => {
    setStaffNurseId(null);
    setStaffCode('');
    setSystemMode('select');
  };

  const updateRequest = (day: any, value: any) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const nurseIdKey = String(staffNurseId);
    setRequests((prev: any) => {
      const monthRequests = { ...(prev[monthKey] || {}) };
      const nurseRequests = { ...(monthRequests[nurseIdKey] || {}) };
      
      if (value) {
        nurseRequests[day] = value;
      } else {
        delete nurseRequests[day];
      }
      
      monthRequests[nurseIdKey] = nurseRequests;
      return { ...prev, [monthKey]: monthRequests };
    });
    // DB保存（エラー時にユーザーに通知）
    if (staffNurseId) {
      saveWithStatus(async () => {
        await saveRequestToDB(staffNurseId, targetYear, targetMonth, day, value);
      }).catch(() => {
        alert('⚠️ 保存に失敗しました。管理者にお知らせください。');
      });
    }
  };

  // 職員用希望入力：夜勤対応のセルクリックハンドラ
  const handleStaffRequestClick = (day: number, _currentRequest: string | null) => {
    const days = getDaysInMonth(targetYear, targetMonth);
    const monthKey = `${targetYear}-${targetMonth}`;
    const nurseIdKey = String(staffNurseId);

    // 希望上限チェック（新しい希望を追加する操作のみ）
    const maxReq = staffNurseId ? (nurseShiftPrefs[staffNurseId]?.maxRequests || 0) : 0;
    if (maxReq > 0) {
      const currentReqs = requests[monthKey]?.[nurseIdKey] || {};
      const currentVal = currentReqs[day] || null;
      // 空セルからの新規追加の場合のみチェック
      if (!currentVal) {
        const currentCount = Object.entries(currentReqs).filter(([, v]) => v !== '明' && v !== '管明').length;
        if (currentCount >= maxReq) {
          alert('希望の上限に達しています');
          return;
        }
      }
    }

    // DB保存用の変更記録
    const dbChanges: Record<number, string | null> = {};

    setRequests((prev: any) => {
      const monthRequests = { ...(prev[monthKey] || {}) };
      const nurseRequests = { ...(monthRequests[nurseIdKey] || {}) };

      // ★ 最新stateから現在値を取得
      const currentRequest = nurseRequests[day] || null;

      // サイクル: 空→休→有→前→後→日→夜→管夜→空
      // 「明」「管明」はクリック→休に変更
      let newValue: string | null;
      if (!currentRequest) newValue = '休';
      else if (currentRequest === '休') newValue = '有';
      else if (currentRequest === '有') newValue = '前';
      else if (currentRequest === '前') newValue = '後';
      else if (currentRequest === '後') newValue = '日';
      else if (currentRequest === '日') newValue = '夜';
      else if (currentRequest === '夜') newValue = '管夜';
      else if (currentRequest === '明' || currentRequest === '管明') newValue = '休';
      else newValue = null; // 管夜 or その他→クリア

      // ① 「夜」or「管夜」解除時 → 自動セットした明系・休のみクリア
      if (currentRequest === '夜' || currentRequest === '管夜') {
        const akeType = currentRequest === '夜' ? '明' : '管明';
        if (day + 1 <= days && nurseRequests[day + 1] === akeType) {
          delete nurseRequests[day + 1];
          dbChanges[day + 1] = null;
        }
        if (day + 2 <= days && nurseRequests[day + 2] === '休') {
          const d2 = day + 2;
          const otherNightBefore = d2 >= 2 && (nurseRequests[d2 - 2] === '夜' || nurseRequests[d2 - 2] === '管夜') && (d2 - 2) !== day;
          if (!otherNightBefore) {
            delete nurseRequests[day + 2];
            dbChanges[day + 2] = null;
          }
        }
      }

      // ② セル値更新
      if (newValue) {
        nurseRequests[day] = newValue;
      } else {
        delete nurseRequests[day];
      }
      dbChanges[day] = newValue;

      // ③ 新しく「夜」or「管夜」→ 翌日・翌々日が空の場合のみ自動セット
      if (newValue === '夜' || newValue === '管夜') {
        const akeType = newValue === '夜' ? '明' : '管明';
        if (day + 1 <= days && !nurseRequests[day + 1]) {
          nurseRequests[day + 1] = akeType;
          dbChanges[day + 1] = akeType;
        }
        if (day + 2 <= days && !nurseRequests[day + 2]) {
          nurseRequests[day + 2] = '休';
          dbChanges[day + 2] = '休';
        }
      }

      monthRequests[nurseIdKey] = nurseRequests;
      return { ...prev, [monthKey]: monthRequests };
    });

    // ④ DB保存（state更新後に実行）
    setTimeout(() => {
      if (staffNurseId) {
        saveWithStatus(async () => {
          for (const [d, val] of Object.entries(dbChanges)) {
            await saveRequestToDB(staffNurseId, targetYear, targetMonth, Number(d), val);
          }
        });
      }
    }, 0);
  };

  const getOtherRequestsCount = (day) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const monthRequests = requests[monthKey] || {};
    const myIdKey = String(staffNurseId);
    let count = 0;
    Object.entries(monthRequests).forEach(([nurseIdKey, reqs]) => {
      if (nurseIdKey !== myIdKey && reqs[day]) {
        count++;
      }
    });
    return count;
  };

  // ============================================
  // 画面レンダリング
  // ============================================

  // システム選択画面
  if (systemMode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-lg border border-white/50">
          <div className="text-center mb-10">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-5 rounded-2xl inline-block mb-5 shadow-lg">
              <Calendar className="text-white" size={56} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{departmentName}勤務表システム</h1>
            <p className="text-lg font-bold text-indigo-600">{targetYear}年{targetMonth + 1}月</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setSystemMode('admin')}
              className="w-full px-6 py-5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Lock size={24} />
              管理者ログイン
            </button>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-sm text-gray-500">または</span>
              </div>
            </div>
            
            <button
              onClick={() => setSystemMode('staff')}
              className="w-full px-6 py-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Users size={24} />
              職員用（休み希望入力）
            </button>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="w-full mt-6 px-4 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors text-sm"
            >
              ← 部門選択に戻る
            </button>
          )}

          <p className="text-center text-xs text-gray-400 mt-8">
            データはサーバーに安全に保存されます
          </p>
        </div>
      </div>
    );
  }

  // 管理者ログイン画面
  if (systemMode === 'admin' && !isAdminAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Lock className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">管理者ログイン</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="管理者パスワード"
              />
            </div>
            
            {adminError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {adminError}
              </div>
            )}
            
            <button
              onClick={handleAdminLogin}
              className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              ログイン
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>初期パスワード: <code className="bg-gray-200 px-2 py-0.5 rounded">admin123</code></p>
            <p className="mt-1">※ ダッシュボードから変更できます</p>
          </div>
        </div>
      </div>
    );
  }

  // ダッシュボード画面
  if (systemMode === 'dashboard' && isAdminAuth) {
    const months = [
      { num: 0, name: '1月' }, { num: 1, name: '2月' }, { num: 2, name: '3月' },
      { num: 3, name: '4月' }, { num: 4, name: '5月' }, { num: 5, name: '6月' },
      { num: 6, name: '7月' }, { num: 7, name: '8月' }, { num: 8, name: '9月' },
      { num: 9, name: '10月' }, { num: 10, name: '11月' }, { num: 11, name: '12月' }
    ];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const getMonthStatus = (monthNum: number) => {
      const mk = `${dashboardYear}-${monthNum}`;
      const monthReqs = requests[mk] || {};
      const reqCount = Object.keys(monthReqs).length;
      const hasSchedule = schedule && schedule.month === mk;
      
      if (hasSchedule) return { status: 'generated', label: '生成済み', count: 0 };
      if (reqCount > 0) return { status: 'collecting', label: '希望収集中', count: reqCount };
      return { status: 'empty', label: '未着手', count: 0 };
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="text-indigo-600" size={24} />
                  {departmentName}勤務表管理システム
                </h1>
                <p className="text-sm text-gray-500">ダッシュボード</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowSettings(!showSettings)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${showSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  <Settings size={16} /> 職員管理
                </button>
                <button onClick={() => setShowDeadlineSettings(true)} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm flex items-center gap-1">
                  <Clock size={16} /> 締め切り設定
                </button>
                <button onClick={() => { setShowPasswordChange(true); setNewPasswordInput(''); setNewPasswordConfirm(''); setPasswordChangeError(''); }} className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-sm flex items-center gap-1">
                  <Lock size={16} /> パスワード変更
                </button>
                <button onClick={handleAdminLogout} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm flex items-center gap-1">
                  <LogOut size={16} /> ログアウト
                </button>
              </div>
            </div>
          </div>

          {/* 職員管理パネル（ダッシュボード内） */}
          {showSettings && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <h2 className="text-lg font-bold text-gray-800">職員一覧（{activeNurses.length}名）</h2>
                <div className="flex gap-2">
                  <label className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer flex items-center gap-2 text-sm transition-colors">
                    <Upload size={16} />
                    Excel読込
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                  </label>
                  <button onClick={() => setShowAddNurse(true)} className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm transition-colors">
                    <Plus size={16} /> 追加
                  </button>
                </div>
              </div>
              <div className="overflow-auto max-h-[50vh]">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="border p-2 text-left">氏名</th>
                      <th className="border p-2 text-center">役職</th>
                      <th className="border p-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => (
                      <tr key={nurse.id} className="hover:bg-gray-50">
                        <td className="border p-2">
                          {editingNurse === nurse.id ? (
                            <input defaultValue={nurse.name} id={`dash-name-${nurse.id}`} className="px-2 py-1 border rounded w-full" />
                          ) : nurse.name}
                        </td>
                        <td className="border p-2 text-center">
                          {editingNurse === nurse.id ? (
                            <select defaultValue={nurse.position} id={`dash-pos-${nurse.id}`} className="px-2 py-1 border rounded">
                              {Object.keys(POSITIONS).map(pos => (
                                <option key={pos} value={pos}>{pos}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded ${POSITIONS[nurse.position]?.color}`}>{nurse.position}</span>
                          )}
                        </td>
                        <td className="border p-2 text-center">
                          {editingNurse === nurse.id ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => {
                                const name = (document.getElementById(`dash-name-${nurse.id}`) as HTMLInputElement).value;
                                const position = (document.getElementById(`dash-pos-${nurse.id}`) as HTMLSelectElement).value;
                                updateNurse(nurse.id, { name, position });
                                setEditingNurse(null);
                              }} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs"><Save size={14} /></button>
                              <button onClick={() => setEditingNurse(null)} className="px-2 py-1 bg-gray-300 rounded text-xs"><X size={14} /></button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => setEditingNurse(nurse.id)} className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs"><Edit2 size={14} /></button>
                              <button onClick={() => { if(confirm(`${nurse.name}を削除しますか？`)) deleteNurse(nurse.id); }} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs"><Trash2 size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 締め切り表示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <Clock className="text-blue-500" size={20} />
              <p className="text-blue-800">
                <strong>希望提出締め切り:</strong> 毎月{requestDeadline.day}日 {String(requestDeadline.hour).padStart(2, '0')}:{String(requestDeadline.minute).padStart(2, '0')}
              </p>
            </div>
          </div>

          {/* 年選択 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => setDashboardYear(prev => prev - 1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-lg font-bold">◀</button>
              <h2 className="text-3xl font-bold text-gray-800">{dashboardYear}年</h2>
              <button onClick={() => setDashboardYear(prev => prev + 1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-lg font-bold">▶</button>
            </div>
          </div>

          {/* 月カード */}
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {months.map(({ num, name }) => {
              const status = getMonthStatus(num);
              const isCurrentMonth = dashboardYear === currentYear && num === currentMonth;
              return (
                <button
                  key={num}
                  onClick={() => {
                    setTargetYear(dashboardYear);
                    setTargetMonth(num);
                    setShowSettings(false);
                    setSystemMode('adminSchedule');
                  }}
                  className={`p-4 rounded-2xl border-2 hover:shadow-lg transition-all ${
                    status.status === 'generated' ? 'bg-green-50 border-green-400' :
                    status.status === 'collecting' ? 'bg-yellow-50 border-yellow-400' :
                    'bg-gray-50 border-gray-200'
                  } ${isCurrentMonth ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                >
                  <div className="text-lg font-bold mb-2">{name}</div>
                  <div className="text-xs">
                    {status.status === 'generated' && (
                      <span className="flex items-center justify-center gap-1 text-green-700">
                        <CheckCircle size={14} />
                        {status.label}
                      </span>
                    )}
                    {status.status === 'collecting' && (
                      <span className="text-yellow-700">
                        {status.label}<br />
                        <span className="font-bold">{status.count}人</span>入力済
                      </span>
                    )}
                    {status.status === 'empty' && (
                      <span className="text-gray-400">{status.label}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 凡例 */}
          <div className="mt-6 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-4 border border-white/50">
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300"></div>
                <span>未着手</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-400"></div>
                <span>希望収集中</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 border border-green-400"></div>
                <span>生成済み</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded ring-2 ring-blue-500 ring-offset-1"></div>
                <span>今月</span>
              </div>
            </div>
          </div>

          {/* 使い方 */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>💡 使い方：</strong>月のカードをクリックすると、その月の勤務表画面に移動します。
            </p>
          </div>
        </div>

        {/* 締め切り設定モーダル */}
        {showDeadlineSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">⏰ 希望提出締め切り設定</h3>
                <button onClick={() => setShowDeadlineSettings(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">締め切り日</label>
                  <select value={requestDeadline.day} onChange={(e) => setRequestDeadline(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg">
                    {Array.from({ length: 28 }, (_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">時</label>
                    <select value={requestDeadline.hour} onChange={(e) => setRequestDeadline(prev => ({ ...prev, hour: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border rounded-lg">
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">分</label>
                    <select value={requestDeadline.minute} onChange={(e) => setRequestDeadline(prev => ({ ...prev, minute: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border rounded-lg">
                      {[0, 15, 30, 45, 59].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={() => setShowDeadlineSettings(false)}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  設定を保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* パスワード変更モーダル */}
        {showPasswordChange && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">🔑 管理者パスワード変更</h3>
                <button onClick={() => setShowPasswordChange(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none"
                    placeholder="4文字以上"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
                  <input
                    type="password"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handlePasswordChange()}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none"
                    placeholder="もう一度入力"
                  />
                </div>
                {passwordChangeError && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{passwordChangeError}</div>
                )}
                <button onClick={handlePasswordChange}
                  className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors">
                  パスワードを変更
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Excel読込モーダル（ダッシュボード内） */}
        {showExcelImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  {excelImportConfirmed ? '✅ 職員情報 読み込み完了' : 'Excelから職員情報を読み込み'}
                </h3>
                <button onClick={closeExcelImport} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {excelImportConfirmed ? (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                    <p className="text-green-800 font-bold text-lg mb-1">✅ {nurses.filter(n => n.active).length}名の職員情報を読み込みました</p>
                    <p className="text-sm text-green-700">職員一覧が更新されました。</p>
                  </div>
                  <div className="border rounded-lg max-h-64 overflow-y-auto mb-6">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm">No.</th>
                          <th className="px-4 py-2 text-left text-sm">氏名</th>
                          <th className="px-4 py-2 text-left text-sm">役職</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nurses.filter(n => n.active).map((nurse, idx) => (
                          <tr key={nurse.id} className="border-t">
                            <td className="px-4 py-2 text-sm">{idx + 1}</td>
                            <td className="px-4 py-2 text-sm font-medium">{nurse.name}</td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`text-xs px-2 py-1 rounded ${POSITIONS[nurse.position]?.color}`}>{nurse.position}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={closeExcelImport}
                      className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold transition-colors">
                      閉じる
                    </button>
                  </div>
                </>
              ) : (
                <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
                <div>
                  <label className="block text-sm font-medium mb-1">開始行</label>
                  <input type="number" min="1" value={importConfig.startRow}
                    onChange={(e) => { const c = { ...importConfig, startRow: parseInt(e.target.value) || 1 }; setImportConfig(c); updateExcelPreview(excelData, c); }}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">終了行</label>
                  <input type="number" min="1" value={importConfig.endRow}
                    onChange={(e) => { const c = { ...importConfig, endRow: parseInt(e.target.value) || 30 }; setImportConfig(c); updateExcelPreview(excelData, c); }}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">氏名列</label>
                  <input type="text" value={importConfig.nameColumn}
                    onChange={(e) => { const c = { ...importConfig, nameColumn: e.target.value.toUpperCase() }; setImportConfig(c); updateExcelPreview(excelData, c); }}
                    className="w-full px-3 py-2 border rounded-lg" placeholder="C" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職列</label>
                  <input type="text" value={importConfig.positionColumn}
                    onChange={(e) => { const c = { ...importConfig, positionColumn: e.target.value.toUpperCase() }; setImportConfig(c); updateExcelPreview(excelData, c); }}
                    className="w-full px-3 py-2 border rounded-lg" placeholder="D" />
                </div>
              </div>
              <div className="mb-6">
                <h4 className="font-semibold mb-3">プレビュー（{excelPreview.length}名）</h4>
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm">行</th>
                        <th className="px-4 py-2 text-left text-sm">氏名</th>
                        <th className="px-4 py-2 text-left text-sm">役職（読取値）</th>
                        <th className="px-4 py-2 text-left text-sm">判定役職</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">データが見つかりません</td></tr>
                      ) : (
                        excelPreview.map((item, index) => {
                          const posStr = (item.position || '').replace(/\s+/g, '');
                          let jp = '一般';
                          if (posStr.includes('師長')) jp = '師長';
                          else if (posStr.includes('副主任') || (posStr.includes('副') && posStr.includes('主任'))) jp = '副主任';
                          else if (posStr.includes('主任')) jp = '主任';
                          return (
                            <tr key={index} className="border-t">
                              <td className="px-4 py-2 text-sm">{item.row}</td>
                              <td className="px-4 py-2 text-sm font-medium">{item.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{item.position || '-'}</td>
                              <td className="px-4 py-2 text-sm"><span className={`text-xs px-2 py-1 rounded ${POSITIONS[jp]?.color}`}>{jp}</span></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800"><strong>⚠️ 注意：</strong>「反映」で現在の職員リストが<strong>全て上書き</strong>されます。</p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={closeExcelImport} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">キャンセル</button>
                <button onClick={applyExcelImport} disabled={excelPreview.length === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors">反映</button>
              </div>
                </>
              )}
            </div>
          </div>
          </div>
        )}

        {/* 看護師追加モーダル（ダッシュボード内） */}
        {showAddNurse && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md my-4">
              <h3 className="text-xl font-bold mb-4">職員を追加</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">氏名</label>
                  <input
                    type="text"
                    value={newNurseData.name}
                    onChange={(e) => setNewNurseData({ ...newNurseData, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                    placeholder="例：山田 花子"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職</label>
                  <select
                    value={newNurseData.position}
                    onChange={(e) => setNewNurseData({ ...newNurseData, position: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                  >
                    {Object.keys(POSITIONS).map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddNurse(false);
                    setNewNurseData({ name: '', position: '一般' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={addNurse}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
    );
  }

  // 職員ログイン画面
  if (systemMode === 'staff' && !staffNurseId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Users className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">休み希望入力</h1>
            <p className="text-lg text-emerald-600 font-bold mt-1">{targetYear}年{targetMonth + 1}月分</p>
          </div>

          <div className="space-y-4">
            {/* 対象年月 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">対象年月</label>
              <div className="flex justify-center gap-2">
                <select value={targetYear} onChange={(e) => setTargetYear(parseInt(e.target.value))}
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none">
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                </select>
                <select value={targetMonth} onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none">
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i + 1}月</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">アクセスコード（6桁）</label>
              <input
                type="text"
                value={staffCode}
                onChange={(e) => {
                  setStaffCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                  setStaffError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && staffCode.length === 6 && handleStaffLogin()}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-3xl font-mono tracking-widest focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            
            {staffError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {staffError}
              </div>
            )}
            
            <button
              onClick={handleStaffLogin}
              disabled={staffCode.length !== 6}
              className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              入力画面へ
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>アクセスコードは管理者から配布されます</p>
          </div>
        </div>
      </div>
    );
  }

  // 職員用休み希望入力画面
  if (systemMode === 'staff' && staffNurseId) {
    const nurse = nursesWithCodes.find(n => n.id === staffNurseId);
    if (!nurse) {
      setStaffNurseId(null);
      return null;
    }

    const monthKey = `${targetYear}-${targetMonth}`;
    const myIdKey = String(staffNurseId);
    const myRequests = requests[monthKey]?.[myIdKey] || {};
    const requestCount = Object.entries(myRequests).filter(([_, v]) => v !== '明' && v !== '管明').length;
    const myMaxRequests = nurseShiftPrefs[staffNurseId]?.maxRequests || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">{nurse.name}さん</h1>
                <p className="text-lg font-bold text-emerald-600">{targetYear}年{targetMonth + 1}月の休み希望入力</p>
              </div>
              <button
                onClick={handleStaffLogout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors self-start"
              >
                <LogOut size={18} />
                終了
              </button>
            </div>
          </div>

          {/* DB接続状態 */}
          {dbStatus === 'error' && (
            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="text-2xl">⚠️</div>
                <div>
                  <p className="text-sm font-bold text-red-700">データベース接続エラー</p>
                  <p className="text-red-600 text-sm">入力した希望が保存されない可能性があります。管理者にお知らせください。</p>
                  <p className="text-red-400 text-xs mt-1">詳細: {dbError}</p>
                </div>
              </div>
            </div>
          )}
          {dbStatus === 'testing' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-700">🔄 データベース接続を確認中...</p>
            </div>
          )}

          {/* 提出期限 */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <Clock className="text-orange-500" size={20} />
              <div>
                <p className="text-sm font-bold text-orange-700">提出期限</p>
                <p className="text-orange-600">{targetYear}年{targetMonth + 1}月{requestDeadline.day}日 {String(requestDeadline.hour).padStart(2, '0')}:{String(requestDeadline.minute).padStart(2, '0')} まで</p>
              </div>
            </div>
          </div>

          {/* 入力状況 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-100 p-3 rounded-xl">
                  <Calendar className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">入力済み希望</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {myMaxRequests > 0 ? `${requestCount}/${myMaxRequests}日` : `${requestCount}日`}
                  </p>
                  {myMaxRequests > 0 && requestCount >= myMaxRequests && (
                    <p className="text-sm font-bold text-red-500">上限に達しました</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('入力した希望をすべてクリアしますか？')) {
                    setRequests(prev => {
                      const updated = { ...prev };
                      if (updated[monthKey]) {
                        delete updated[monthKey][myIdKey];
                      }
                      return updated;
                    });
                  }
                }}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                すべてクリア
              </button>
            </div>
          </div>

          {/* 操作説明 */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-800">
              <strong>操作方法：</strong>日付をタップすると「公休」→「有休」→「午前半休」→「午後半休」→「日勤」→「夜勤」→「管理夜勤」→「クリア」と切り替わります。
              <br />
              <span className="text-purple-600">「夜勤」「管理夜勤」を選択すると翌日が自動で「夜明」「管明」、翌々日が「公休」になります。</span>
              <br />
              <span className="text-emerald-600">休:2 有:1</span> などは他の職員の希望数です。
              <br />
              <span className="text-orange-600">「前月」と表示された日は前月勤務に基づく制約のため変更できません。</span>
            </p>
          </div>

          {/* カレンダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-4 md:p-6 border border-white/50">
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                <div
                  key={day}
                  className={`text-center font-bold py-2 text-sm ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {/* 月初の空白 */}
              {Array.from({ length: new Date(targetYear, targetMonth, 1).getDay() }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              
              {/* 日付 */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const request = myRequests[day];
                const othersCount = getOtherRequestsCount(day);
                const dayOfWeek = new Date(targetYear, targetMonth, day).getDay();
                const isHoliday = dayOfWeek === 0 || dayOfWeek === 6;
                const prevCon = (prevMonthConstraints as any)[staffNurseId]?.[day];
                const isLocked = !!prevCon; // 前月制約がある日はロック
                
                return (
                  <div key={day} className="relative">
                    <button
                      onClick={() => {
                        if (isLocked) return; // 前月制約日はタップ不可
                        handleStaffRequestClick(day, request);
                      }}
                      className={`w-full aspect-square rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                        isLocked
                          ? prevCon === '明' ? 'bg-pink-100 border-pink-300 cursor-not-allowed opacity-80'
                          : prevCon === '管明' ? 'bg-cyan-100 border-cyan-300 cursor-not-allowed opacity-80'
                          : 'bg-gray-200 border-gray-400 cursor-not-allowed opacity-80'
                          : request === '休'
                          ? 'bg-gray-200 border-gray-400 shadow-inner'
                          : request === '有'
                          ? 'bg-emerald-200 border-emerald-400 shadow-inner'
                          : request === '前'
                          ? 'bg-orange-200 border-orange-400 shadow-inner'
                          : request === '後'
                          ? 'bg-amber-200 border-amber-400 shadow-inner'
                          : request === '日'
                          ? 'bg-blue-200 border-blue-400 shadow-inner'
                          : request === '夜'
                          ? 'bg-purple-200 border-purple-400 shadow-inner'
                          : request === '明'
                          ? 'bg-pink-200 border-pink-400 shadow-inner'
                          : request === '管夜'
                          ? 'bg-teal-200 border-teal-400 shadow-inner'
                          : request === '管明'
                          ? 'bg-cyan-200 border-cyan-400 shadow-inner'
                          : isHoliday
                          ? 'bg-red-50 border-red-100 hover:border-red-300'
                          : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow'
                      }`}
                    >
                      <span className={`text-sm md:text-base font-medium ${
                        dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'
                      }`}>
                        {day}
                      </span>
                      {isLocked ? (
                        <span className={`text-xs font-bold ${prevCon === '明' ? 'text-pink-600' : prevCon === '管明' ? 'text-cyan-600' : 'text-gray-600'}`}>
                          {prevCon === '明' ? '夜明' : prevCon === '管明' ? '管明' : '公休'}
                        </span>
                      ) : request ? (
                        <span className={`text-xs font-bold ${
                          request === '休' ? 'text-gray-600' :
                          request === '有' ? 'text-emerald-700' :
                          request === '前' ? 'text-orange-700' :
                          request === '後' ? 'text-amber-700' :
                          request === '日' ? 'text-blue-700' :
                          request === '夜' ? 'text-purple-700' :
                          request === '明' ? 'text-pink-700' :
                          request === '管夜' ? 'text-teal-700' :
                          request === '管明' ? 'text-cyan-700' : ''
                        }`}>
                          {request === '休' ? '公休' : request === '有' ? '有休' : request === '前' ? '午前半休' : request === '後' ? '午後半休' : request === '日' ? '日勤' : request === '夜' ? '夜勤' : request === '明' ? '夜明' : request === '管夜' ? '管夜' : request === '管明' ? '管明' : request}
                        </span>
                      ) : null}
                      {isLocked && (
                        <span className="text-[9px] text-orange-500">前月</span>
                      )}
                    </button>
                    
                    {othersCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold shadow">
                        {othersCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* フッター */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <div className="flex items-center justify-center gap-4">
              <p>入力内容は自動保存されます</p>
              <button
                onClick={async () => {
                  await reloadRequestsFromDB();
                  alert('✅ 最新データを読み込みました');
                }}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors flex items-center gap-1"
              >
                <RefreshCw size={14} />
                最新データ読込
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 管理者画面
  // ============================================
  
  const monthKey = `${targetYear}-${targetMonth}`;
  const monthRequests = requests[monthKey] || {};
  const totalRequests: number = Object.values(monthRequests).reduce((sum: number, reqs: any) => sum + Object.keys(reqs as any).length, 0) as number;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{departmentName}勤務表システム</h1>
              <p className="text-lg font-bold text-indigo-600">{targetYear}年{targetMonth + 1}月</p>
              {/* 保存状態インジケーター */}
              {saveStatus === 'saving' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm animate-pulse">
                  <RefreshCw size={14} className="animate-spin" />
                  保存中...
                </div>
              )}
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-sm">
                  <CheckCircle size={14} />
                  保存済み {lastSavedAt && `${String(lastSavedAt.getHours()).padStart(2, '0')}:${String(lastSavedAt.getMinutes()).padStart(2, '0')}`}
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm">
                  <AlertCircle size={14} />
                  保存エラー
                  <button
                    onClick={() => setSaveStatus('idle')}
                    className="underline hover:no-underline ml-1"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSystemMode('dashboard')}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors"
              >
                ← ダッシュボード
              </button>
              <button
                onClick={() => setShowAccessCodes(true)}
                className="px-4 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Lock size={18} />
                コード発行
              </button>
              <button
                onClick={async () => {
                  const results: string[] = [];
                  try {
                    const { error: r1 } = await supabase.from(getTableName('requests')).select('nurse_id').limit(1);
                    results.push(r1 ? '❌ requests READ: ' + r1.message : '✅ requests READ: OK');
                  } catch (e: any) { results.push('❌ requests READ: ' + e.message); }
                  try {
                    const { error: w1 } = await supabase.from(getTableName('requests')).upsert(
                      { nurse_id: 99999, year: 1999, month: 0, day: 99, shift_type: 'test' },
                      { onConflict: 'nurse_id,year,month,day' }
                    );
                    if (w1) { results.push('❌ requests WRITE: ' + w1.message); }
                    else {
                      results.push('✅ requests WRITE: OK');
                      await supabase.from(getTableName('requests')).delete().eq('nurse_id', 99999);
                    }
                  } catch (e: any) { results.push('❌ requests WRITE: ' + e.message); }
                  try {
                    const { error: r2 } = await supabase.from(getTableName('nurses')).select('id').limit(1);
                    results.push(r2 ? '❌ nurses READ: ' + r2.message : '✅ nurses READ: OK');
                  } catch (e: any) { results.push('❌ nurses READ: ' + e.message); }
                  try {
                    const { error: r3 } = await supabase.from(getTableName('schedules')).select('id').limit(1);
                    results.push(r3 ? '❌ schedules READ: ' + r3.message : '✅ schedules READ: OK');
                  } catch (e: any) { results.push('❌ schedules READ: ' + e.message); }
                  try {
                    const { error: r4 } = await supabase.from(getTableName('settings')).select('key').limit(1);
                    results.push(r4 ? '❌ settings READ: ' + r4.message : '✅ settings READ: OK');
                  } catch (e: any) { results.push('❌ settings READ: ' + e.message); }
                  alert('【DB診断結果】\n\n' + results.join('\n'));
                }}
                className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl flex items-center gap-2 transition-colors border border-gray-200"
              >
                <Activity size={18} />
                DB診断
              </button>
              <button
                onClick={async () => {
                  // ★ まずDBから最新の希望データを取得
                  const freshData = await reloadRequestsFromDB();
                  const mk = `${targetYear}-${targetMonth}`;
                  if (!originalRequests[mk] && freshData) {
                    setOriginalRequests((prev: any) => ({
                      ...prev,
                      [mk]: JSON.parse(JSON.stringify(freshData[mk] || {}))
                    }));
                  }
                  setShowRequestReview(true);
                }}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Eye size={18} />
                希望確認
              </button>
              <button
                onClick={async () => {
                  await reloadRequestsFromDB();
                  setShowUnsubmitted(true);
                }}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl flex items-center gap-2 transition-colors border border-red-200"
              >
                <AlertCircle size={18} />
                未提出者
              </button>
              <button
                onClick={() => setShowPrevMonthImport(true)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                  previousMonthData ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Upload size={18} />
                前月読込{previousMonthData ? '✓' : ''}
              </button>
              <button
                onClick={() => setShowGenerateConfig(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Settings size={18} />
                生成設定
              </button>
              <button
                onClick={() => setShowNurseShiftPrefs(true)}
                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl flex items-center gap-2 transition-colors border border-purple-200"
              >
                <Moon size={18} />
                職員別設定
              </button>
              <button
                onClick={generateSchedule}
                disabled={generating}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl flex items-center gap-2 shadow hover:shadow-lg transition-all disabled:opacity-50"
              >
                <RefreshCw size={18} className={generating ? 'animate-spin' : ''} />
                {generating ? (generatingPhase || '生成中...') : '自動生成'}
              </button>
              {schedule && (
                <button
                  onClick={saveCurrentAsVersion}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl flex items-center gap-2 transition-colors border border-blue-200"
                >
                  <Save size={18} />
                  保存（v{nextVersionNumber}）
                </button>
              )}
              {scheduleVersions.length > 0 && (
                <button
                  onClick={() => setShowVersionHistory(true)}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl flex items-center gap-2 transition-colors border border-indigo-200"
                >
                  <Clock size={18} />
                  履歴（{scheduleVersions.length}）
                </button>
              )}
              {schedule && (
                <button
                  onClick={() => {
                    if (confirm('勤務表データを消去しますか？\n\n※ 前月の読込データと職員の休み希望はそのまま保持されます。')) {
                      setSchedule(null);
                      clearScheduleFromLocalStorage();
                      // DBから勤務表データのみ削除
                      (async () => {
                        try {
                          await supabase.from(getTableName('schedules')).delete()
                            .eq('year', targetYear).eq('month', targetMonth);
                          console.log('勤務表データを消去しました');
                        } catch (e) { console.error('消去エラー:', e); }
                      })();
                    }
                  }}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center gap-2 transition-colors border border-red-200"
                >
                  <Trash2 size={18} />
                  勤務表消去
                </button>
              )}
              <button
                onClick={handleAdminLogout}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <LogOut size={18} />
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-3 rounded-xl">
                <Users className="text-indigo-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">登録職員</p>
                <p className="text-2xl font-bold text-indigo-600">{activeNurses.length}名</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-3 rounded-xl">
                <Calendar className="text-emerald-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">希望入力済</p>
                <p className="text-2xl font-bold text-emerald-600">{totalRequests}件</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-3 rounded-xl">
                <Moon className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">対象月</p>
                <p className="text-2xl font-bold text-purple-600">{targetMonth + 1}月</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className={`${previousMonthData ? 'bg-orange-100' : 'bg-gray-100'} p-3 rounded-xl`}>
                <Upload className={previousMonthData ? 'text-orange-600' : 'text-gray-400'} size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">前月データ</p>
                <p className={`text-2xl font-bold ${previousMonthData ? 'text-orange-600' : 'text-gray-400'}`}>
                  {previousMonthData ? '読込済' : '未読込'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 前月制約表示（前月データがある場合） */}
        {previousMonthData && Object.keys(prevMonthConstraints).length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-orange-600" size={20} />
                <span className="font-medium text-orange-800">前月データに基づく当月初の制約が設定されています</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPrevMonthReview(true)}
                className="text-sm text-orange-600 hover:text-orange-800 underline"
              >
                詳細を確認
              </button>
            </div>
            <p className="text-sm text-orange-700 mt-2">
              {Object.keys(prevMonthConstraints).filter(id => Object.keys(prevMonthConstraints[id]).length > 0).length}名に
              当月1〜3日目の制約が適用されます（夜勤明け・休みなど）
            </p>
          </div>
        )}

        {/* 職員管理パネル */}
        {showSettings && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800">職員一覧（{activeNurses.length}名）</h2>
              <div className="flex gap-2">
                <label className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer flex items-center gap-2 transition-colors">
                  <Upload size={18} />
                  Excel読込
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => setShowAddNurse(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus size={18} />
                  追加
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeNurses.map(nurse => (
                <div
                  key={nurse.id}
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 p-3 rounded-xl transition-colors"
                >
                  {editingNurse === nurse.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={nurse.name}
                        className="flex-1 px-2 py-1 border rounded"
                        id={`edit-name-${nurse.id}`}
                      />
                      <select
                        defaultValue={nurse.position}
                        className="px-2 py-1 border rounded"
                        id={`edit-pos-${nurse.id}`}
                      >
                        {Object.keys(POSITIONS).map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const name = (document.getElementById(`edit-name-${nurse.id}`) as HTMLInputElement).value;
                          const position = (document.getElementById(`edit-pos-${nurse.id}`) as HTMLSelectElement).value;
                          updateNurse(nurse.id, { name, position });
                          setEditingNurse(null);
                        }}
                        className="p-1 text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Save size={18} className="pointer-events-none" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingNurse(null);
                        }}
                        className="p-1 text-gray-600 hover:text-gray-800 cursor-pointer"
                      >
                        <X size={18} className="pointer-events-none" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                          {nurse.position}
                        </span>
                        <span className="font-medium">{nurse.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingNurse(nurse.id);
                          }}
                          className="p-2 text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
                        >
                          <Edit2 size={16} className="pointer-events-none" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirm(nurse);
                          }}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 勤務表表示エリア（生成前・後共通） */}
        {(() => {
          // 表示用データを計算（schedule存在時はそのデータ、未生成時は希望＋制約から構築）
          const scheduleDisplayData: { [key: string]: any[] } = {};
          if (schedule && schedule.month === `${targetYear}-${targetMonth}`) {
            // スケジュールデータからコピー（全職員分を保証＋サニタイズ）
            activeNurses.forEach(nurse => {
              const raw = schedule.data[nurse.id];
              if (raw && Array.isArray(raw)) {
                scheduleDisplayData[nurse.id] = raw.map(s => sanitizeShift(s));
              } else {
                scheduleDisplayData[nurse.id] = new Array(daysInMonth).fill(null);
              }
            });
          } else {
            activeNurses.forEach(nurse => {
              const shifts = new Array(daysInMonth).fill(null);
              // 前月制約を反映
              if (prevMonthConstraints[nurse.id]) {
                for (const [dayStr, shift] of Object.entries(prevMonthConstraints[nurse.id])) {
                  const dayIndex = parseInt(dayStr) - 1;
                  if (dayIndex >= 0 && dayIndex < daysInMonth) shifts[dayIndex] = shift;
                }
              }
              // 希望を反映（制約で埋まっていない日のみ）
              const nurseReqs = monthRequests[String(nurse.id)] || {};
              for (const [dayStr, val] of Object.entries(nurseReqs)) {
                const dayIndex = parseInt(dayStr) - 1;
                if (dayIndex >= 0 && dayIndex < daysInMonth && !shifts[dayIndex]) {
                  shifts[dayIndex] = val;
                }
              }
              scheduleDisplayData[nurse.id] = shifts;
            });
          }

          // セル編集ハンドラ（schedule未生成時は自動作成）
          // 方式:
          //   「夜」を手動設定 → 翌日・翌々日の元値をバックアップ → 「明」「休」で上書き
          //   「夜」を解除 →
          //     バックアップあり（手動設定した夜）→ 元の値に復元
          //     バックアップなし（自動生成/DB由来の夜）→ 翌日・翌々日はそのまま変更しない
          const handleCellClick = (nurseId: any, dayIndex: number, currentShift: string | null) => {
            const CYCLE = ['日', '夜', '管夜', '休', '有', '午前半', '午後半', null];
            const currentIdx = currentShift ? CYCLE.indexOf(currentShift) : -1;
            const nextIdx = (currentShift === '明' || currentShift === '管明') ? CYCLE.indexOf('休') : (currentIdx >= 0 ? (currentIdx + 1) % CYCLE.length : 0);
            const newShift = CYCLE[nextIdx];
            const bk = nightBackupRef.current;

            const updateData = (data: any) => {
              const newData = JSON.parse(JSON.stringify(data));
              if (!newData[nurseId]) newData[nurseId] = new Array(daysInMonth).fill(null);
              
              // ★ 特別処理: 夜→管夜 の切り替え（明→管明に差し替えるだけ）
              if (currentShift === '夜' && newShift === '管夜') {
                newData[nurseId][dayIndex] = '管夜';
                if (dayIndex + 1 < daysInMonth && newData[nurseId][dayIndex + 1] === '明') {
                  newData[nurseId][dayIndex + 1] = '管明';
                  updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 2, '管明');
                }
                // 翌々日の「休」はそのまま（夜でも管夜でも休は共通）
                return newData;
              }

              // ① 「夜」or「管夜」から別のシフトに変更 → 復元
              if ((currentShift === '夜' || currentShift === '管夜') && newShift !== currentShift) {
                const key1 = `${nurseId}-${dayIndex + 1}`;
                const key2 = `${nurseId}-${dayIndex + 2}`;
                const currentAke = currentShift === '夜' ? '明' : '管明';
                // バックアップがあれば復元
                if (key1 in bk) {
                  if (dayIndex + 1 < daysInMonth) {
                    newData[nurseId][dayIndex + 1] = bk[key1];
                    updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 2, bk[key1]);
                  }
                  delete bk[key1];
                } else {
                  // バックアップなし（自動生成由来）→ 対応する明けのみクリア
                  if (dayIndex + 1 < daysInMonth && newData[nurseId][dayIndex + 1] === currentAke) {
                    newData[nurseId][dayIndex + 1] = null;
                    updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 2, null);
                  }
                }
                if (key2 in bk) {
                  if (dayIndex + 2 < daysInMonth) {
                    newData[nurseId][dayIndex + 2] = bk[key2];
                    updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 3, bk[key2]);
                  }
                  delete bk[key2];
                }
                // バックアップなしの休はそのまま残す（手動で設定した可能性）
              }
              
              // ② クリックしたセルの値を更新
              newData[nurseId][dayIndex] = newShift;
              
              // ③ 新しいシフトが「夜」or「管夜」→ 翌日・翌々日を自動セット（既存の夜勤系は上書きしない）
              if (newShift === '夜' || newShift === '管夜') {
                const akeType = newShift === '夜' ? '明' : '管明';
                if (dayIndex + 1 < daysInMonth) {
                  const key1 = `${nurseId}-${dayIndex + 1}`;
                  const existing1 = newData[nurseId][dayIndex + 1];
                  // 夜・管夜は上書きしない（別の夜勤シフト）、それ以外はバックアップして上書き
                  if (existing1 !== '夜' && existing1 !== '管夜') {
                    bk[key1] = existing1;
                    newData[nurseId][dayIndex + 1] = akeType;
                    updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 2, akeType);
                  }
                }
                if (dayIndex + 2 < daysInMonth) {
                  const key2 = `${nurseId}-${dayIndex + 2}`;
                  const existing2 = newData[nurseId][dayIndex + 2];
                  // 夜・管夜・明・管明は上書きしない
                  if (existing2 !== '夜' && existing2 !== '管夜' && existing2 !== '明' && existing2 !== '管明') {
                    bk[key2] = existing2;
                    newData[nurseId][dayIndex + 2] = '休';
                    updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 3, '休');
                  }
                }
              }
              
              return newData;
            };

            if (schedule) {
              setSchedule((prev: any) => ({
                ...prev,
                data: updateData(prev.data)
              }));
            } else {
              const baseData = {};
              activeNurses.forEach(nurse => {
                baseData[nurse.id] = scheduleDisplayData[nurse.id] ? [...scheduleDisplayData[nurse.id]] : new Array(daysInMonth).fill(null);
              });
              const newData = updateData(baseData);
              setSchedule({ month: `${targetYear}-${targetMonth}`, data: newData });
            }
            saveWithStatus(async () => {
              await updateScheduleCellInDB(nurseId, targetYear, targetMonth, dayIndex + 1, newShift);
            });
          };

          return (
          <div className={`bg-white/90 backdrop-blur-sm shadow-lg border border-white/50 ${
            isMaximized ? 'fixed inset-0 z-50 rounded-none p-2 overflow-y-auto' : 'rounded-2xl p-6'
          }`}>
            <div className={`flex items-center justify-between ${isMaximized ? 'mb-1' : 'flex-col md:flex-row gap-4 mb-6'}`}>
              <h2 className={`font-bold text-gray-800 ${isMaximized ? 'text-base' : 'text-xl'}`}>
                {targetYear}年{targetMonth + 1}月 勤務表
                {!schedule && <span className="ml-2 text-xs font-normal text-orange-600 bg-orange-50 px-2 py-0.5 rounded">未生成</span>}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className={`bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 transition-colors ${isMaximized ? 'px-2 py-1 text-xs' : 'px-4 py-2'}`}
                >
                  {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={18} />}
                  {isMaximized ? '戻す' : '最大化'}
                </button>
                <button
                  onClick={exportToExcel}
                  className={`bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-1 transition-colors ${isMaximized ? 'px-2 py-1 text-xs' : 'px-4 py-2'}`}
                >
                  <Download size={isMaximized ? 14 : 18} />
                  Excel出力
                </button>
              </div>
            </div>

            {/* 手動編集の説明（最大化時は非表示） */}
            {!isMaximized && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>💡 手動編集：</strong>セルをクリックすると「日」→「夜」→「管夜」→「休」→「有」→「午前半」→「午後半」→「空」と切り替わります。「夜」選択時は翌日が自動で「明」、翌々日が「休」に、「管夜」選択時は翌日が「管明」、翌々日が「休」になります。「明」「管明」をクリックすると「休」に変わります。
              </p>
            </div>
            )}

            {/* 希望・前月制約の反映状態（最大化時は非表示） */}
            {!isMaximized && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-700 mb-2">
                <strong>🔍 希望・前月制約の反映状態：</strong>
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-green-500 rounded"></span>
                  <span>= 希望通り</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-red-400 rounded"></span>
                  <span>= 希望と異なる</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-orange-400 rounded"></span>
                  <span>= 前月制約と異なる</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block px-1 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">元:休</span>
                  <span>= 元の希望</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block px-1 py-0.5 bg-orange-100 text-orange-500 rounded text-[10px]">前:明</span>
                  <span>= 前月制約</span>
                </div>
              </div>
            </div>
            )}
            
            <div className={`overflow-auto border rounded-lg ${isMaximized ? 'max-h-[calc(100vh-52px)]' : 'max-h-[70vh]'}`}>
              <table className={`w-full border-collapse ${isMaximized ? 'text-[11px]' : 'text-sm'}`}>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-100">
                    <th className={`border sticky left-0 bg-gray-100 z-30 whitespace-nowrap text-left ${isMaximized ? 'px-1 py-0.5 text-[11px] min-w-[110px]' : 'p-2'}`}>氏名</th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dow = getDayOfWeek(targetYear, targetMonth, day);
                      const holidayList = getJapaneseHolidays(targetYear, targetMonth);
                      const isNationalHoliday = holidayList.includes(day);
                      const isHoliday = dow === '日' || dow === '土' || isNationalHoliday;
                      return (
                        <th
                          key={day}
                          className={`border ${isMaximized ? 'px-0 py-0 min-w-[20px]' : 'p-1 min-w-[32px]'} ${isHoliday ? 'bg-red-50' : 'bg-gray-100'}`}
                        >
                          <div className={`${isMaximized ? 'text-[9px] leading-none' : 'text-xs'} ${dow === '日' || isNationalHoliday ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>
                            {dow}
                          </div>
                          <div className={`${isMaximized ? 'text-[10px] leading-none' : ''} ${dow === '日' || isNationalHoliday ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>{day}</div>
                        </th>
                      );
                    })}
                    {/* 個人別統計ヘッダー */}
                    <th className={`border bg-purple-100 text-purple-800 sticky z-20 ${isMaximized ? 'p-0 text-[9px] right-[54px]' : 'p-1 text-xs right-[72px]'}`}>夜</th>
                    <th className={`border bg-blue-100 text-blue-800 sticky z-20 ${isMaximized ? 'p-0 text-[9px] right-[36px]' : 'p-1 text-xs right-[48px]'}`}>日</th>
                    <th className={`border bg-gray-200 text-gray-700 sticky z-20 ${isMaximized ? 'p-0 text-[9px] right-[18px]' : 'p-1 text-xs right-[24px]'}`}>休</th>
                    <th className={`border bg-amber-100 text-amber-800 sticky right-0 z-20 ${isMaximized ? 'p-0 text-[9px]' : 'p-1 text-xs'}`}>勤</th>
                  </tr>
                </thead>
                <tbody>
                  {activeNurses.map((nurse, nIdx) => {
                    const shifts = scheduleDisplayData[nurse.id] || [];
                    const stats = {
                      night: shifts.filter(s => s === '夜' || s === '管夜').length,
                      day: shifts.filter(s => s === '日').length,
                      off: shifts.filter(s => s === '休' || s === '有').length
                        + shifts.filter(s => s === '午前半' || s === '午後半').length * 0.5,
                      work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '午前半' && s !== '午後半').length
                    };
                    
                    return (
                      <tr key={nurse.id} className={`hover:bg-gray-50 ${isMaximized ? 'leading-tight' : ''}`}>
                        <td className={`border sticky left-0 bg-white z-10 font-medium whitespace-nowrap ${isMaximized ? 'px-1 py-px text-[11px] min-w-[110px]' : 'p-2'}`}>
                          <span className={`${isMaximized ? 'text-[9px]' : 'text-[9px]'} text-gray-400 mr-0.5`}>{nIdx + 1}</span>
                          <span className={`${isMaximized ? 'text-[9px]' : 'text-[9px]'} px-0.5 rounded mr-0.5 ${POSITIONS[nurse.position]?.color}`}>
                            {nurse.position.charAt(0)}
                          </span>
                          {nurse.name}
                          {!isMaximized && nurseShiftPrefs[nurse.id]?.noNightShift && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1 rounded">夜×</span>}
                          {!isMaximized && nurseShiftPrefs[nurse.id]?.noDayShift && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">日×</span>}
                          {!isMaximized && nurseShiftPrefs[nurse.id]?.excludeFromMaxDaysOff && <span className="ml-1 text-[10px] bg-orange-100 text-orange-600 px-1 rounded">除外</span>}
                        </td>
                        {shifts.map((shift: any, i: number) => {
                          const day = i + 1;
                          const nurseIdKey = String(nurse.id);
                          const mk = `${targetYear}-${targetMonth}`;
                          const reqVal = (requests[mk]?.[nurseIdKey] || {})[day];
                          const prevCon = (prevMonthConstraints as any)[nurse.id]?.[day];
                          // 希望との比較
                          const matchesRequest = reqVal && shift === reqVal;
                          const differsFromRequest = reqVal && shift !== reqVal;
                          const differsFromPrev = prevCon && shift !== prevCon;
                          return (
                          <td
                            key={i}
                            onClick={() => handleCellClick(nurse.id, i, sanitizeShift(shift))}
                            className={`border text-center cursor-pointer hover:bg-blue-50 transition-colors ${isMaximized ? 'px-0 py-px' : 'p-1'} ${SHIFT_TYPES[shift]?.color || ''} ${
                              matchesRequest ? 'border-2 border-green-500' :
                              differsFromRequest ? 'border-2 border-red-400' :
                              differsFromPrev ? 'border-2 border-orange-400' : ''
                            }`}
                            style={{ minWidth: isMaximized ? '20px' : '32px' }}
                          >
                            <div className={isMaximized ? 'text-[11px] leading-none' : ''}>{shift || ''}</div>
                            {!isMaximized && differsFromRequest && (
                              <div className="text-[9px] text-gray-400 leading-tight">元:{reqVal}</div>
                            )}
                            {!isMaximized && differsFromPrev && !reqVal && (
                              <div className="text-[9px] text-orange-400 leading-tight">前:{prevCon}</div>
                            )}
                          </td>
                          );
                        })}
                        {/* 個人別統計 */}
                        {(() => {
                          const pref = nurseShiftPrefs[nurse.id];
                          const maxN = pref?.noNightShift ? 0 : (pref?.maxNightShifts ?? generateConfig.maxNightShifts);
                          const differs = stats.night !== maxN;
                          return (
                            <td className={`border text-center bg-purple-50 font-bold text-purple-700 sticky z-[5] ${isMaximized ? 'p-0 text-[10px] right-[54px]' : 'p-1 right-[72px]'} ${differs ? 'border-2 border-red-500' : ''}`}>
                              {stats.night}{differs && <span className="text-red-500 text-[9px]">({maxN})</span>}
                            </td>
                          );
                        })()}
                        <td className={`border text-center bg-blue-50 font-bold text-blue-700 sticky z-[5] ${isMaximized ? 'p-0 text-[10px] right-[36px]' : 'p-1 right-[48px]'}`}>{stats.day}</td>
                        {(() => {
                          const isExcluded = nurseShiftPrefs[nurse.id]?.excludeFromMaxDaysOff;
                          const offDiffers = !isExcluded && stats.off !== generateConfig.maxDaysOff;
                          return (
                            <td className={`border text-center bg-gray-100 font-bold text-gray-600 sticky z-[5] ${isMaximized ? 'p-0 text-[10px] right-[18px]' : 'p-1 right-[24px]'} ${offDiffers ? 'outline outline-2 outline-red-500 -outline-offset-1' : ''}`}>
                              {stats.off}{offDiffers && <span className="text-red-500 text-[9px]">({generateConfig.maxDaysOff})</span>}
                            </td>
                          );
                        })()}
                        <td className={`border text-center bg-amber-50 font-bold text-amber-700 sticky right-0 z-[5] ${isMaximized ? 'p-0 text-[10px]' : 'p-1'}`}>{stats.work}</td>
                      </tr>
                    );
                  })}
                  
                  {/* 日別統計行 */}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-purple-50 font-bold">
                    <td className={`border sticky left-0 bg-purple-50 z-30 text-purple-800 ${isMaximized ? 'p-0.5 text-[10px]' : 'p-2'}`}>夜勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '夜' || shift === '管夜') count++;
                      });
                      // getNightReq と同じロジックで夜勤必要数を計算
                      const nightRequired = (() => {
                        const firstDow = new Date(targetYear, targetMonth, 1).getDay();
                        const weeks: { s: number; e: number; c: number }[] = [];
                        let cur = 1, wi = 0;
                        const dUS = firstDow === 0 ? 0 : (7 - firstDow);
                        if (dUS > 0) {
                          weeks.push({ s: 1, e: Math.min(dUS, daysInMonth), c: generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1] });
                          cur = dUS + 1; wi = 1;
                        }
                        while (cur <= daysInMonth) {
                          const pi = generateConfig.startWithThree ? (wi % 2) : ((wi + 1) % 2);
                          const ed = Math.min(cur + 6, daysInMonth);
                          weeks.push({ s: cur, e: ed, c: generateConfig.nightShiftPattern[pi] });
                          cur = ed + 1; wi++;
                        }
                        const d = i + 1;
                        for (const p of weeks) { if (d >= p.s && d <= p.e) return p.c; }
                        return 3;
                      })();
                      return (
                        <td key={i} className={`border text-center text-purple-700 ${isMaximized ? 'p-0 text-[10px]' : 'p-1'} ${count < nightRequired ? 'bg-red-200 text-red-700' : count > nightRequired ? 'bg-yellow-200 text-yellow-700' : ''}`}>
                          <div>{count}</div>
                          <div className="text-[9px] text-gray-400">/{nightRequired}</div>
                        </td>
                      );
                    })}
                    <td colSpan={4} className={`border ${isMaximized ? 'p-0' : 'p-1'}`}></td>
                  </tr>
                  <tr className="bg-pink-50 font-bold">
                    <td className={`border sticky left-0 bg-pink-50 z-30 text-pink-800 ${isMaximized ? 'p-0.5 text-[10px]' : 'p-2'}`}>夜明人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '明' || shift === '管明') count++;
                      });
                      return (
                        <td key={i} className={`border text-center text-pink-700 ${isMaximized ? 'p-0 text-[10px]' : 'p-1'}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className={`border ${isMaximized ? 'p-0' : 'p-1'}`}></td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td className={`border sticky left-0 bg-blue-50 z-30 text-blue-800 ${isMaximized ? 'p-0.5 text-[10px]' : 'p-2'}`}>日勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '日') count++;
                      });
                      const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                      const isWeekend = dow === '土' || dow === '日';
                      const day = i + 1;
                      const isYearEnd = targetMonth === 11 && (day === 30 || day === 31);
                      const isNewYear = targetMonth === 0 && (day >= 1 && day <= 3);
                      const holidayListF = getJapaneseHolidays(targetYear, targetMonth);
                      const isNatHolF = holidayListF.includes(day);
                      const minRequired = isYearEnd ? generateConfig.yearEndDayStaff :
                                          isNewYear ? generateConfig.newYearDayStaff :
                                          (isWeekend || isNatHolF) ? generateConfig.weekendDayStaff :
                                          generateConfig.weekdayDayStaff;
                      const isStrictDay = isWeekend || isNatHolF || isYearEnd || isNewYear;
                      const isDeviation = isStrictDay
                        ? count !== minRequired
                        : (count < minRequired || count > minRequired + 2);
                      return (
                        <td key={i} className={`border text-center text-blue-700 ${isMaximized ? 'p-0 text-[10px]' : 'p-1'} ${isDeviation ? 'outline outline-3 outline-red-500 -outline-offset-1 bg-red-50' : ''}`}>
                          <div>{count}</div>
                          <div className="text-[9px] text-gray-400">/{isStrictDay ? minRequired : `${minRequired}-${minRequired + 2}`}</div>
                        </td>
                      );
                    })}
                    <td colSpan={4} className={`border ${isMaximized ? 'p-0' : 'p-1'}`}></td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className={`border sticky left-0 bg-gray-100 z-30 text-gray-700 ${isMaximized ? 'p-0.5 text-[10px]' : 'p-2'}`}>休日人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '休' || shift === '有') count++;
                        else if (shift === '午前半' || shift === '午後半') count += 0.5;
                      });
                      return (
                        <td key={i} className={`border text-center text-gray-600 ${isMaximized ? 'p-0 text-[10px]' : 'p-1'}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className={`border ${isMaximized ? 'p-0' : 'p-1'}`}></td>
                  </tr>
                  <tr className="bg-amber-50 font-bold">
                    <td className={`border sticky left-0 bg-amber-50 z-30 text-amber-800 ${isMaximized ? 'p-0.5 text-[10px]' : 'p-2'}`}>出勤計</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明' && shift !== '管明' && shift !== '午前半' && shift !== '午後半') count++;
                      });
                      return (
                        <td key={i} className={`border text-center text-amber-700 ${isMaximized ? 'p-0 text-[10px]' : 'p-1'}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className={`border ${isMaximized ? 'p-0' : 'p-1'}`}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            {/* 統計サマリー */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      total += shifts.filter(s => s === '夜' || s === '管夜').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-purple-600">夜勤総数</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      total += shifts.filter(s => s === '日').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-blue-600">日勤総数</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">
                  {(() => {
                    const nightCounts = activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      return shifts.filter(s => s === '夜' || s === '管夜').length;
                    });
                    return `${Math.min(...nightCounts)}〜${Math.max(...nightCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-gray-600">夜勤回数(個人)</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {(() => {
                    const workCounts = activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      return shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                    });
                    return `${Math.min(...workCounts)}〜${Math.max(...workCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-amber-600">出勤日数(個人)</div>
              </div>
            </div>
            
            {/* 週別夜勤統計 */}
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                <Moon size={18} />
                週別夜勤人数
              </h4>
              <div className="flex flex-wrap gap-3">
                {(() => {
                  // 週ごとの実際の夜勤人数を計算
                  const weeks = [];
                  const firstDay = new Date(targetYear, targetMonth, 1);
                  const firstDayOfWeek = firstDay.getDay();
                  let currentDay = 1;
                  let weekIndex = 0;
                  
                  const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                  if (daysUntilSunday > 0) {
                    weeks.push({ start: 1, end: daysUntilSunday, weekNum: 1 });
                    currentDay = daysUntilSunday + 1;
                    weekIndex = 1;
                  }
                  
                  while (currentDay <= daysInMonth) {
                    const endDay = Math.min(currentDay + 6, daysInMonth);
                    weeks.push({ start: currentDay, end: endDay, weekNum: weekIndex + 1 });
                    currentDay = endDay + 1;
                    weekIndex++;
                  }
                  
                  return weeks.map((w, i) => {
                    // 週内の各日の夜勤人数を計算
                    let totalNightShifts = 0;
                    let daysCovered = 0;
                    for (let d = w.start - 1; d < w.end; d++) {
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[d];
                        if (shift === '夜' || shift === '管夜') totalNightShifts++;
                      });
                      daysCovered++;
                    }
                    const avgNight = daysCovered > 0 ? (totalNightShifts / daysCovered).toFixed(1) : 0;
                    
                    return (
                      <div key={i} className="bg-white rounded-lg px-4 py-2 text-center min-w-[100px]">
                        <div className="text-xs text-gray-500">第{w.weekNum}週</div>
                        <div className="text-xs text-gray-400">{w.start}〜{w.end}日</div>
                        <div className="text-xl font-bold text-purple-700">{avgNight}</div>
                        <div className="text-xs text-purple-600">人/日</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            
            {/* 個人別詳細統計 */}
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Users size={18} />
                個人別統計詳細
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">氏名</th>
                      <th className="border p-2 text-center bg-purple-50">夜勤</th>
                      <th className="border p-2 text-center bg-blue-50">日勤</th>
                      <th className="border p-2 text-center bg-pink-50">夜明</th>
                      <th className="border p-2 text-center bg-gray-200">公休</th>
                      <th className="border p-2 text-center bg-emerald-50">有休</th>
                      <th className="border p-2 text-center bg-amber-50">出勤計</th>
                      <th className="border p-2 text-center bg-orange-50">土日出勤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      const stats = {
                        night: shifts.filter(s => s === '夜' || s === '管夜').length,
                        day: shifts.filter(s => s === '日').length,
                        ake: shifts.filter(s => s === '明' || s === '管明').length,
                        off: shifts.filter(s => s === '休').length,
                        paid: shifts.filter(s => s === '有').length,
                        work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明' && s !== '管明').length,
                        weekend: 0
                      };
                      
                      // 土日出勤をカウント
                      shifts.forEach((shift, i) => {
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                          const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                          if (dow === '土' || dow === '日') {
                            stats.weekend++;
                          }
                        }
                      });
                      
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 font-medium whitespace-nowrap">
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                              {nurse.position.charAt(0)}
                            </span>
                            {nurse.name}
                          </td>
                          <td className="border p-2 text-center bg-purple-50 font-bold text-purple-700">{stats.night}</td>
                          <td className="border p-2 text-center bg-blue-50 font-bold text-blue-700">{stats.day}</td>
                          <td className="border p-2 text-center bg-pink-50 font-bold text-pink-700">{stats.ake}</td>
                          <td className="border p-2 text-center bg-gray-200 font-bold text-gray-700">{stats.off}</td>
                          <td className="border p-2 text-center bg-emerald-50 font-bold text-emerald-700">{stats.paid}</td>
                          <td className="border p-2 text-center bg-amber-50 font-bold text-amber-700">{stats.work}</td>
                          <td className="border p-2 text-center bg-orange-50 font-bold text-orange-700">{stats.weekend}</td>
                        </tr>
                      );
                    })}
                    {/* 合計行 */}
                    <tr className="bg-gray-100 font-bold">
                      <td className="border p-2">合計</td>
                      {(() => {
                        let totals = { night: 0, day: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = scheduleDisplayData[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜' || s === '管夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.ake += shifts.filter(s => s === '明' || s === '管明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明' && s !== '管明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center bg-purple-100">{totals.night}</td>
                            <td className="border p-2 text-center bg-blue-100">{totals.day}</td>
                            <td className="border p-2 text-center bg-pink-100">{totals.ake}</td>
                            <td className="border p-2 text-center bg-gray-300">{totals.off}</td>
                            <td className="border p-2 text-center bg-emerald-100">{totals.paid}</td>
                            <td className="border p-2 text-center bg-amber-100">{totals.work}</td>
                            <td className="border p-2 text-center bg-orange-100">{totals.weekend}</td>
                          </>
                        );
                      })()}
                    </tr>
                    {/* 平均行 */}
                    <tr className="bg-gray-50">
                      <td className="border p-2 text-gray-600">平均</td>
                      {(() => {
                        const n = activeNurses.length;
                        let totals = { night: 0, day: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = scheduleDisplayData[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜' || s === '管夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.ake += shifts.filter(s => s === '明' || s === '管明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明' && s !== '管明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center text-purple-600">{(totals.night / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-blue-600">{(totals.day / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-pink-600">{(totals.ake / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-gray-600">{(totals.off / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-emerald-600">{(totals.paid / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-amber-600">{(totals.work / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-orange-600">{(totals.weekend / n).toFixed(1)}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          );
        })()}

        {/* アクセスコード発行モーダル */}
        {showAccessCodes && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">アクセスコード一覧</h3>
                <button
                  onClick={() => setShowAccessCodes(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>使い方：</strong>各職員にコードを伝えてください。
                  職員はトップ画面から「職員用（休み希望入力）」を選び、コードを入力します。
                  <br />
                  <strong>※コードは職員名から自動生成されるため、常に同じコードが使用できます。</strong>
                </p>
              </div>
              
              <button
                onClick={copyAllCodes}
                className="mb-4 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg self-start transition-colors"
              >
                全員分をコピー
              </button>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {nursesWithCodes.map(nurse => (
                  <div
                    key={nurse.id}
                    className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                        {nurse.position}
                      </span>
                      <span className="font-medium">{nurse.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono font-bold text-xl px-4 py-2 bg-white border-2 rounded-lg">
                        {nurse.accessCode}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(nurse.accessCode);
                          alert(`${nurse.name}さんのコードをコピーしました: ${nurse.accessCode}`);
                        }}
                        className="px-3 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg text-sm transition-colors"
                      >
                        コピー
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        )}


        {/* 希望未提出者モーダル */}
        {showUnsubmitted && (() => {
          const mk = `${targetYear}-${targetMonth}`;
          const monthReqs = requests[mk] || {};
          const submitted = activeNurses.filter(n => {
            const nurseReqs = monthReqs[String(n.id)] || {};
            return Object.keys(nurseReqs).length > 0;
          });
          const unsubmitted = activeNurses.filter(n => {
            const nurseReqs = monthReqs[String(n.id)] || {};
            return Object.keys(nurseReqs).length === 0;
          });

          const exportUnsubmittedExcel = () => {
            const wb = XLSX.utils.book_new();
            // 未提出者シート
            const data1 = unsubmitted.map((n, i) => ({
              'No.': i + 1,
              '氏名': n.name,
              '役職': n.position,
              'アクセスコード': generateFixedAccessCode(n.id, n.name),
              '状態': '未提出'
            }));
            if (data1.length === 0) data1.push({ 'No.': 0, '氏名': '全員提出済み', '役職': '', 'アクセスコード': '', '状態': '' });
            const ws1 = XLSX.utils.json_to_sheet(data1);
            ws1['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 8 }];
            XLSX.utils.book_append_sheet(wb, ws1, '未提出者');
            // 提出済みシート
            const data2 = submitted.map((n, i) => {
              const nurseReqs = monthReqs[String(n.id)] || {};
              const reqDays = Object.entries(nurseReqs).map(([d, s]) => `${d}日:${s}`).join(', ');
              return { 'No.': i + 1, '氏名': n.name, '役職': n.position, '希望内容': reqDays, '希望日数': Object.keys(nurseReqs).length };
            });
            const ws2 = XLSX.utils.json_to_sheet(data2);
            ws2['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 8 }, { wch: 50 }, { wch: 10 }];
            XLSX.utils.book_append_sheet(wb, ws2, '提出済み');
            XLSX.writeFile(wb, `希望提出状況_${targetYear}年${targetMonth + 1}月.xlsx`);
          };

          return (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">希望提出状況（{targetYear}年{targetMonth + 1}月）</h3>
                  <button onClick={() => setShowUnsubmitted(false)} className="p-2 hover:bg-gray-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                {/* サマリー */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">{activeNurses.length}</div>
                    <div className="text-xs text-blue-600">全職員</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{submitted.length}</div>
                    <div className="text-xs text-green-600">提出済み</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{unsubmitted.length}</div>
                    <div className="text-xs text-red-600">未提出</div>
                  </div>
                </div>

                {/* 未提出者リスト */}
                {unsubmitted.length > 0 ? (
                  <div className="mb-4">
                    <h4 className="font-semibold text-red-700 mb-2">⚠️ 未提出者（{unsubmitted.length}名）</h4>
                    <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-red-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-xs">No.</th>
                            <th className="px-3 py-1.5 text-left text-xs">氏名</th>
                            <th className="px-3 py-1.5 text-left text-xs">役職</th>
                            <th className="px-3 py-1.5 text-left text-xs">コード</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unsubmitted.map((n, i) => (
                            <tr key={n.id} className="border-t border-red-100">
                              <td className="px-3 py-1.5 text-sm">{i + 1}</td>
                              <td className="px-3 py-1.5 text-sm font-medium">{n.name}</td>
                              <td className="px-3 py-1.5 text-sm">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${POSITIONS[n.position]?.color}`}>{n.position}</span>
                              </td>
                              <td className="px-3 py-1.5 text-sm font-mono text-gray-500">{generateFixedAccessCode(n.id, n.name)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
                    <CheckCircle className="mx-auto text-green-600 mb-1" size={32} />
                    <p className="text-green-800 font-bold">全員提出済みです！</p>
                  </div>
                )}

                {/* 提出済みリスト */}
                {submitted.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-green-700 mb-2">✅ 提出済み（{submitted.length}名）</h4>
                    <div className="border border-green-200 rounded-lg max-h-36 overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-green-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-xs">氏名</th>
                            <th className="px-3 py-1.5 text-left text-xs">役職</th>
                            <th className="px-3 py-1.5 text-right text-xs">希望日数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {submitted.map(n => {
                            const cnt = Object.keys(monthReqs[String(n.id)] || {}).length;
                            return (
                              <tr key={n.id} className="border-t border-green-100">
                                <td className="px-3 py-1.5 text-sm font-medium">{n.name}</td>
                                <td className="px-3 py-1.5 text-sm">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${POSITIONS[n.position]?.color}`}>{n.position}</span>
                                </td>
                                <td className="px-3 py-1.5 text-sm text-right">{cnt}日</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ボタン */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={exportUnsubmittedExcel}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <Download size={16} />
                    Excel出力
                  </button>
                  <button onClick={() => setShowUnsubmitted(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* 希望確認モーダル（確認・消去のみ） */}
        {showRequestReview && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">希望一覧（{targetYear}年{targetMonth + 1}月）</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportRequestsToExcel}
                    className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm hover:bg-emerald-200 transition-colors flex items-center gap-1"
                  >
                    <Download size={14} />
                    Excel出力
                  </button>
                  <button
                    onClick={async () => {
                      await reloadRequestsFromDB();
                      alert('✅ 最新の希望データを読み込みました');
                    }}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={14} />
                    DB再読込
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('⚠️ この月の全職員の希望データをDBから完全に削除しますか？\n\n削除後、職員に再入力を依頼してください。')) return;
                      try {
                        const { error } = await supabase.from(getTableName('requests')).delete()
                          .eq('year', targetYear).eq('month', targetMonth);
                        if (error) throw error;
                        setRequests(prev => {
                          const updated = { ...prev };
                          delete updated[`${targetYear}-${targetMonth}`];
                          return updated;
                        });
                        setOriginalRequests({});
                        alert('✅ 全希望データを削除しました。');
                      } catch (e: any) {
                        alert('❌ 削除エラー: ' + (e?.message || '不明'));
                      }
                    }}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    全希望消去
                  </button>
                  <button onClick={() => setShowRequestReview(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 確認専用：</strong>希望の編集は勤務表画面で直接行ってください。ここでは確認と一括消去のみ可能です。
                </p>
              </div>

              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100">
                      <th className="border p-2 sticky left-0 bg-gray-100 z-20 whitespace-nowrap">氏名</th>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const dow = getDayOfWeek(targetYear, targetMonth, day);
                        const isNatHoliday = getJapaneseHolidays(targetYear, targetMonth).includes(day);
                        return (
                          <th key={day} className={`border p-1 min-w-[32px] ${dow === '日' || isNatHoliday ? 'bg-red-50' : dow === '土' ? 'bg-blue-50' : 'bg-gray-100'}`}>
                            <div className={`text-xs ${dow === '日' || isNatHoliday ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>{dow}</div>
                            <div className={dow === '日' || isNatHoliday ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}>{day}</div>
                          </th>
                        );
                      })}
                      <th className="border p-2 bg-gray-100">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map((nurse: any, nIdx: number) => {
                      const nurseIdKey = String(nurse.id);
                      const nurseReqs = monthRequests[nurseIdKey] || {};
                      const constraints = prevMonthConstraints[nurse.id] || {};
                      const requestCount = Object.keys(nurseReqs).length;
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                            <span className="text-xs text-gray-400 mr-1">{nIdx + 1}</span>
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>{nurse.position.charAt(0)}</span>
                            {nurse.name}
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const req = nurseReqs[day];
                            const con = constraints[day];
                            return (
                              <td key={day} className={`border p-1 text-center ${
                                req === '休' ? 'bg-gray-200' :
                                req === '有' ? 'bg-emerald-100' :
                                req === '前' ? 'bg-orange-100' :
                                req === '後' ? 'bg-amber-100' :
                                req === '日' ? 'bg-blue-100' :
                                req === '夜' ? 'bg-purple-100' :
                                req === '明' ? 'bg-pink-100' :
                                req === '管夜' ? 'bg-teal-100' :
                                req === '管明' ? 'bg-cyan-100' :
                                req === '午前半' ? 'bg-lime-100' :
                                req === '午後半' ? 'bg-orange-100' :
                                con ? 'bg-orange-50' : ''
                              }`}>
                                {req && <div className="font-medium text-xs">{req}</div>}
                                {!req && con && <div className="text-[10px] text-orange-500">{con}</div>}
                              </td>
                            );
                          })}
                          <td className="border p-1 text-center font-bold">{requestCount}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-50 font-bold">
                      <td className="border p-2 sticky left-0 bg-amber-50 z-10">希望人数</td>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        let count = 0;
                        Object.values(monthRequests).forEach((reqs: any) => { if (reqs[day]) count++; });
                        return (
                          <td key={day} className={`border p-1 text-center ${count >= 3 ? 'text-red-600 bg-red-100' : ''}`}>
                            {count || ''}
                          </td>
                        );
                      })}
                      <td className="border p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setShowRequestReview(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">
                  閉じる
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
        {/* 看護師追加モーダル */}
        {showAddNurse && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md my-4">
              <h3 className="text-xl font-bold mb-4">職員を追加</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">氏名</label>
                  <input
                    type="text"
                    value={newNurseData.name}
                    onChange={(e) => setNewNurseData({ ...newNurseData, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                    placeholder="例：山田 花子"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職</label>
                  <select
                    value={newNurseData.position}
                    onChange={(e) => setNewNurseData({ ...newNurseData, position: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                  >
                    {Object.keys(POSITIONS).map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddNurse(false);
                    setNewNurseData({ name: '', position: '一般' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={addNurse}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
        {/* 削除確認モーダル */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm my-4">
                <div className="text-center mb-6">
                  <div className="bg-red-100 p-4 rounded-full inline-block mb-4">
                    <Trash2 className="text-red-600 pointer-events-none" size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">削除の確認</h3>
                  <p className="text-gray-600">
                    <span className="font-semibold">{deleteConfirm.name}</span>さんを削除しますか？
                  </p>
                  <p className="text-sm text-red-500 mt-2">この操作は取り消せません</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteNurse(deleteConfirm.id);
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    削除する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ読み込みモーダル */}
        {showPrevMonthImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">前月勤務表の読み込み</h3>
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                  <p className="text-sm text-orange-800">
                    <strong>目的：</strong>前月末の勤務状況（夜勤・夜勤明けなど）を読み込み、
                    当月初の勤務を自動で調整します。
                  </p>
                  <ul className="text-sm text-orange-700 mt-2 space-y-1">
                    <li>• 前月末が夜勤 → 1日目は夜勤明け、2日目は休み</li>
                    <li>• 前月末が夜勤明け → 1日目は休み</li>
                    <li>• 連続勤務4日以上 → 1日目は休み</li>
                  </ul>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">前月の勤務表（Excel）を選択</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handlePrevMonthUpload}
                      className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
                    />
                  </label>
                  
                  {previousMonthData && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-sm text-green-800 font-medium">
                        ✅ 前月データ確定済み（{Object.keys(previousMonthData).filter(id => previousMonthData[id] && previousMonthData[id].length > 0).length}名分）
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPrevMonthImport(false);
                            setShowPrevMonthReview(true);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                        >
                          データを確認
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearPreviousMonthData();
                          }}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
                        >
                          クリア
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end mt-6">
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 職員別シフト設定モーダル */}
        {showNurseShiftPrefs && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">🌙 職員別シフト設定</h3>
                  <button onClick={() => setShowNurseShiftPrefs(false)} className="p-2 hover:bg-gray-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>💡 説明：</strong>職員ごとに夜勤の最大回数、日勤なし・夜勤なし、休日上限除外（退職有給消化等）、希望上限を設定できます。
                    自動生成時にこの設定が反映されます。
                    未設定の場合は共通設定（最大{generateConfig.maxNightShifts}回）が適用されます。
                    「希望上限」は職員が入力できる希望数の上限です（0=無制限）。明・管明は自動設定のためカウントに含まれません。
                  </p>
                </div>

                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">氏名</th>
                        <th className="border p-2 text-center">役職</th>
                        <th className="border p-2 text-center">夜勤上限</th>
                        <th className="border p-2 text-center">夜勤なし</th>
                        <th className="border p-2 text-center">日勤なし</th>
                        <th className="border p-2 text-center">休日上限除外</th>
                        <th className="border p-2 text-center">希望上限</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeNurses.map((nurse: any) => {
                        const pref = nurseShiftPrefs[nurse.id] || { maxNightShifts: generateConfig.maxNightShifts, noNightShift: false, noDayShift: false, excludeFromMaxDaysOff: false, maxRequests: 0 };
                        return (
                          <tr key={nurse.id} className="hover:bg-gray-50">
                            <td className="border p-2 font-medium whitespace-nowrap">
                              <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                {nurse.position.charAt(0)}
                              </span>
                              {nurse.name}
                            </td>
                            <td className="border p-2 text-center text-xs">{nurse.position}</td>
                            <td className="border p-2 text-center">
                              <select
                                value={pref.noNightShift ? 0 : pref.maxNightShifts}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, maxNightShifts: val, noNightShift: val === 0 }
                                  }));
                                }}
                                className="px-2 py-1 border rounded text-center w-16"
                              >
                                {Array.from({ length: 11 }, (_, i) => (
                                  <option key={i} value={i}>{i === 0 ? '0 (なし)' : `${i}回`}</option>
                                ))}
                              </select>
                            </td>
                            <td className="border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={pref.noNightShift}
                                onChange={(e) => {
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, noNightShift: e.target.checked, maxNightShifts: e.target.checked ? 0 : generateConfig.maxNightShifts }
                                  }));
                                }}
                                className="w-5 h-5 text-purple-600 rounded"
                              />
                            </td>
                            <td className="border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={pref.noDayShift}
                                onChange={(e) => {
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, noDayShift: e.target.checked }
                                  }));
                                }}
                                className="w-5 h-5 text-blue-600 rounded"
                              />
                            </td>
                            <td className="border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={pref.excludeFromMaxDaysOff || false}
                                onChange={(e) => {
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, excludeFromMaxDaysOff: e.target.checked }
                                  }));
                                }}
                                className="w-5 h-5 text-orange-600 rounded"
                              />
                            </td>
                            <td className="border p-2 text-center">
                              <select
                                value={pref.maxRequests || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, maxRequests: val }
                                  }));
                                }}
                                className="px-2 py-1 border rounded text-center w-20"
                              >
                                {Array.from({ length: 16 }, (_, i) => (
                                  <option key={i} value={i}>{i === 0 ? '無制限' : `${i}個`}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between mt-4">
                  <button
                    onClick={() => {
                      setNurseShiftPrefs({});
                      saveWithStatus(async () => {
                        await saveSettingToDB('nurseShiftPrefs', JSON.stringify({}));
                      });
                    }}
                    className="px-4 py-2 text-gray-500 hover:text-red-500 text-sm"
                  >
                    すべてリセット
                  </button>
                  <button
                    onClick={() => {
                      saveWithStatus(async () => {
                        await saveSettingToDB('nurseShiftPrefs', JSON.stringify(nurseShiftPrefs));
                      });
                      setShowNurseShiftPrefs(false);
                    }}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    設定を保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 勤務表生成設定モーダル */}
        {showGenerateConfig && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">⚙️ 勤務表生成設定</h3>
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* 週ごとの夜勤人数設定 */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      <Moon size={20} />
                      週ごとの夜勤人数（隔週交互）
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">奇数週（第1, 3, 5週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 0 : 1]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [val, prev.nightShiftPattern[1]] : [prev.nightShiftPattern[0], val]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">偶数週（第2, 4週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 1 : 0]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [prev.nightShiftPattern[0], val] : [val, prev.nightShiftPattern[1]]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 週のプレビュー */}
                    <div className="bg-white rounded-lg p-3 text-sm">
                      <p className="font-medium mb-2">{targetYear}年{targetMonth + 1}月のプレビュー:</p>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const weeks = [];
                          const firstDay = new Date(targetYear, targetMonth, 1);
                          const firstDayOfWeek = firstDay.getDay();
                          let currentDay = 1;
                          let weekIndex = 0;
                          
                          // 第1週（月初から最初の日曜日まで）
                          const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                          if (daysUntilSunday > 0) {
                            const count = generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1];
                            weeks.push({ start: 1, end: daysUntilSunday, count, weekNum: 1 });
                            currentDay = daysUntilSunday + 1;
                            weekIndex = 1;
                          }
                          
                          while (currentDay <= daysInMonth) {
                            const patternIndex = generateConfig.startWithThree ? (weekIndex % 2) : ((weekIndex + 1) % 2);
                            const count = generateConfig.nightShiftPattern[patternIndex];
                            const endDay = Math.min(currentDay + 6, daysInMonth);
                            weeks.push({ start: currentDay, end: endDay, count, weekNum: weekIndex + 1 });
                            currentDay = endDay + 1;
                            weekIndex++;
                          }
                          
                          return weeks.map((w, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium ${
                              w.count === 3 ? 'bg-blue-100 text-blue-700' : 
                              w.count === 4 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {w.start}-{w.end}日: {w.count}人
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* その他の設定 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h4 className="font-bold text-gray-800 mb-3">その他の制約</h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大夜勤回数</label>
                        <select
                          value={generateConfig.maxNightShifts}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxNightShifts: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n}回</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大休日数</label>
                        <select
                          value={generateConfig.maxDaysOff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxDaysOff: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 25 }, (_, i) => 3 + i * 0.5).map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大連続勤務</label>
                        <select
                          value={generateConfig.maxConsecutiveDays}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxConsecutiveDays: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  {/* 日勤者数設定 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <Sun size={20} />
                      日勤者数の設定
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">平日</label>
                        <select
                          value={generateConfig.weekdayDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekdayDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">土日・祝日</label>
                        <select
                          value={generateConfig.weekendDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekendDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年末(12/30-31)</label>
                        <select
                          value={generateConfig.yearEndDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, yearEndDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年始(1/1-3)</label>
                        <select
                          value={generateConfig.newYearDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, newYearDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-blue-600">
                      ※ 年末年始設定は12月・1月の勤務表生成時に適用されます
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-6">
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={generating}
                    className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={`inline mr-2 ${generating ? 'animate-spin' : ''}`} />
                    {generating ? (generatingPhase || '生成中...') : 'この設定で生成'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ確認モーダル（マッピング編集UI） */}
        {showPrevMonthReview && (prevMonthRawData.length > 0 || previousMonthData) && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">
                    {prevMonthRawData.length > 0 ? '📋 前月データのマッピング設定' : '✅ 確定済み前月データ'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (prevMonthRawData.length > 0) {
                        cancelPreviousMonthPreview();
                      } else {
                        setShowPrevMonthReview(false);
                      }
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                {prevMonthRawData.length > 0 ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-amber-800">
                        <strong>⚠️ 各職員に対応するExcelの行を選択してください。</strong>
                        <br />
                        システム登録の職員名とExcelの氏名が異なる場合は、ドロップダウンから正しい行を選択してください。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left min-w-[120px]">システム職員</th>
                            <th className="border p-2 text-left min-w-[200px]">Excelデータ選択</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                          <tr>
                            <th className="border p-2"></th>
                            <th className="border p-2"></th>
                            {[7, 6, 5, 4, 3, 2, 1].map(d => (
                              <th key={d} className="border p-1 text-center text-xs text-gray-500">{d}日前</th>
                            ))}
                            <th className="border p-1 text-center text-xs bg-orange-50">1日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">2日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">3日</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const mappedIndex = prevMonthMapping[nurse.id];
                            const mappedData = mappedIndex !== undefined ? prevMonthRawData[mappedIndex] : null;
                            const shifts = mappedData ? mappedData.shifts : [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            
                            // 制約をリアルタイム計算
                            const constraints = {};
                            if (shifts.length > 0) {
                              const lastShift = shifts[shifts.length - 1];
                              const secondLastShift = shifts.length > 1 ? shifts[shifts.length - 2] : '';
                              const thirdLastShift = shifts.length > 2 ? shifts[shifts.length - 3] : '';
                              
                              if (lastShift === '夜') {
                                constraints[0] = '明';
                                constraints[1] = '休';
                                if (thirdLastShift === '夜' && secondLastShift === '明') {
                                  constraints[2] = '休';
                                }
                              } else if (lastShift === '管夜') {
                                constraints[0] = '管明';
                                constraints[1] = '休';
                                if ((thirdLastShift === '夜' || thirdLastShift === '管夜') && (secondLastShift === '明' || secondLastShift === '管明')) {
                                  constraints[2] = '休';
                                }
                              } else if (lastShift === '明' || lastShift === '管明') {
                                constraints[0] = '休';
                                if ((secondLastShift === '夜' || secondLastShift === '管夜') && shifts.length >= 4 && 
                                    (shifts[shifts.length - 4] === '夜' || shifts[shifts.length - 4] === '管夜') && (shifts[shifts.length - 3] === '明' || shifts[shifts.length - 3] === '管明')) {
                                  constraints[1] = '休';
                                }
                              }
                              
                              // 連続勤務チェック
                              let consecutiveWork = 0;
                              for (let i = shifts.length - 1; i >= 0; i--) {
                                const s = shifts[i];
                                if (s && s !== '休' && s !== '有' && s !== '明' && s !== '管明') {
                                  consecutiveWork++;
                                } else {
                                  break;
                                }
                              }
                              if (consecutiveWork >= 4 && !constraints[0]) {
                                constraints[0] = '休';
                              }
                            }
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${!mappedData ? 'bg-yellow-50' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                <td className="border p-2">
                                  <select
                                    value={mappedIndex !== undefined ? mappedIndex : ''}
                                    onChange={(e) => updateMapping(nurse.id, e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value="">-- 選択してください --</option>
                                    {prevMonthRawData.map((row, idx) => (
                                      <option key={idx} value={idx}>
                                        {idx + 1}. {row.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '管夜' ? 'bg-teal-100 text-teal-800' :
                                    shift === '管明' ? 'bg-cyan-100 text-cyan-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[0] === '明' ? 'text-pink-600' :
                                  constraints[0] === '管明' ? 'text-cyan-600' :
                                  constraints[0] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[0] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 統計情報 */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex gap-6 flex-wrap">
                        <span>Excel読み込み件数: <strong>{prevMonthRawData.length}名</strong></span>
                        <span>マッピング済み: <strong className="text-green-600">
                          {Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                        <span>未設定: <strong className="text-yellow-600">
                          {activeNurses.length - Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={cancelPreviousMonthPreview}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={confirmPreviousMonthData}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                      >
                        ✓ 確定する
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-green-800">
                        <strong>✅ 確定済み</strong> - 「自動生成」ボタンを押すと、この制約が適用されます。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left">職員名</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const shifts = previousMonthData[nurse.id] || [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            const constraints = prevMonthConstraints[nurse.id] || {};
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${shifts.length === 0 ? 'bg-gray-100' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '管夜' ? 'bg-teal-100 text-teal-800' :
                                    shift === '管明' ? 'bg-cyan-100 text-cyan-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '明' ? 'text-pink-600' :
                                  constraints[1] === '管明' ? 'text-cyan-600' :
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[3] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[3] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          clearPreviousMonthData();
                          setShowPrevMonthReview(false);
                        }}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      >
                        データをクリア
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrevMonthReview(false)}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                      >
                        閉じる
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* バージョン履歴モーダル */}
        {showVersionHistory && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Clock size={20} className="text-indigo-600" />
                  バージョン履歴
                </h3>
                <button onClick={() => setShowVersionHistory(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {scheduleVersions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">保存されたバージョンはありません</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500 mb-2">最大10件まで保存されます</p>
                    {[...scheduleVersions].reverse().map(ver => {
                      const staffCount = Object.keys(ver.data).length;
                      const ts = new Date(ver.timestamp);
                      const dateStr = `${ts.getFullYear()}/${(ts.getMonth()+1).toString().padStart(2,'0')}/${ts.getDate().toString().padStart(2,'0')} ${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
                      return (
                        <div key={ver.id} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-indigo-700">v{ver.version}</span>
                              <span className="text-sm text-gray-500 ml-3">{dateStr}</span>
                              <span className="text-sm text-gray-400 ml-3">{staffCount}名分</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => restoreVersion(ver.id)}
                                className="px-3 py-1 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors border border-indigo-200"
                              >
                                復元
                              </button>
                              <button
                                onClick={() => deleteVersion(ver.id)}
                                className="px-3 py-1 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex justify-end">
                <button
                  onClick={() => setShowVersionHistory(false)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HcuScheduleSystem;
