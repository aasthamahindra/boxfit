import React from "react";
import styles from '../styles/Cell.module.css';

interface CellProps {
  filled: boolean;
  color?: string;
  isPreview?: boolean;
}

const Cell: React.FC<CellProps> = ({ filled, color, isPreview = false }) => {
  return (
    <div
      className={`${styles.cell} ${isPreview ? styles.preview : ''}`}
      style={{
        backgroundColor: filled ? color : 'transparent',
        borderColor: isPreview ? 'rgba(255, 255, 255, 0.5)' : 'transparent',
      }}
    />
  );
};

export default Cell;