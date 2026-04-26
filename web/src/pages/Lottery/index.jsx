import React from 'react';
import { useTranslation } from 'react-i18next';
import Lottery from '../../components/lottery';

const LotteryPage = () => {
  const { t } = useTranslation();
  return (
    <div className='mt-[60px] px-2'>
      <Lottery t={t} />
    </div>
  );
};

export default LotteryPage;
