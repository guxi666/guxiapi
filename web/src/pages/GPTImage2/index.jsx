import React from 'react';
import { useTranslation } from 'react-i18next';
import GPTImage2 from '../../components/gpt-image2';

const GPTImage2Page = () => {
  const { t } = useTranslation();
  return (
    <div className='mt-[60px] px-2'>
      <GPTImage2 t={t} />
    </div>
  );
};

export default GPTImage2Page;
