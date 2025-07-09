-- 마비노기 체크리스트 동기화용 테이블 (예시: MySQL/MariaDB)
-- sync_id(고유 식별자)별로 전체 데이터를 JSON으로 저장

CREATE TABLE mobinogi_checklist (
    sync_id VARCHAR(64) PRIMARY KEY COMMENT '고유 동기화 ID(UUID 등)',
    data_json JSON NOT NULL COMMENT '전체 체크리스트 데이터(JSON)',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '최종 수정일'
);

-- 숏코드(8자리)와 uuid(64자리) 매핑 테이블
CREATE TABLE mobinogi_sync_code (
    short_code VARCHAR(8) NOT NULL UNIQUE COMMENT '숏코드(8자리)',
    sync_id VARCHAR(64) NOT NULL COMMENT 'UUID(64자리)',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일',
    PRIMARY KEY (short_code),
    FOREIGN KEY (sync_id) REFERENCES mobinogi_checklist(sync_id) ON DELETE CASCADE
);

-- 인덱스 및 기타 옵션은 필요에 따라 추가
-- data_json 예시: {
--   characters: [...],
--   userDailyTasks: [...],
--   userWeeklyTasks: [...],
--   removedDailyTaskIds: [...],
--   removedWeeklyTaskIds: [...],
--   lastReset: { daily: ..., weekly: ... }
-- }
