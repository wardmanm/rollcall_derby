import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store.ts';

// Always use these instead of plain useDispatch / useSelector (ADR-0003).
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
