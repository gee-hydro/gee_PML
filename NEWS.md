# Updates

* 2019-09-18

    - Gaps of `Albedo`, `Emissivity` are filled through linear interpolation and historical interpolation.

    - 2018 and 2019 LAI smoothed by Whittaker (with lambda = 50 and 20 respectively)

    - update PML_V2 dataset to 2019-07-28

         GLDAS     : (761) 2019-07-28
         Emissivity: (789) 2019-08-29
    
     LAI            : 2019-09-02
    
     Albedo     : (789) 2019-08-29
    
    - 修改v014储存格式的错误，double型改为`unsigned int16`. 数据保存至`projects/pml_evapotranspiration/PML/V2/8day`，`PML/OUTPUT/PML_V2_8day_v014`准备删除
    
    

